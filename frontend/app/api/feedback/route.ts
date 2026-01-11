import { NextResponse } from 'next/server';
import { pool } from '@/app/api/lib/db';
import { verifyUserFromRequest } from '@/app/api/lib/verifyUser';
import { getTranslationForUser } from '@/app/api/lib/i18n';
import { createNotification } from '@/app/api/lib/createNotification';

export async function POST(req: Request) {
    let transactionClient = null;
    let userIdForTranslation = null;

    try {
        // 1. Verify User
        const user = await verifyUserFromRequest(
            req.headers.get('authorization') ?? undefined
        );
        userIdForTranslation = user.uid;

        transactionClient = await pool.connect();

        // 2. Rate Limit Check (10 minutes)
        const lastFeedbackRes = await transactionClient.query(
            `SELECT created_at FROM feedbacks WHERE actor = $1 ORDER BY created_at DESC LIMIT 1`,
            [user.uid]
        );

        if ((lastFeedbackRes.rowCount ?? 0) > 0) {
            const lastTime = new Date(lastFeedbackRes.rows[0].created_at).getTime();
            const now = Date.now();
            const diffMins = (now - lastTime) / (1000 * 60);

            if (diffMins < 10) {
                const t = await getTranslationForUser(user.uid, transactionClient);
                return NextResponse.json({ error: t('feedback.rateLimit') }, { status: 429 });
            }
        }

        // 3. Parse Body
        const body = await req.json();
        const { message } = body;

        if (!message || (typeof message === 'string' && message.trim() === '')) {
            const t = await getTranslationForUser(user.uid, transactionClient);
            return NextResponse.json({ error: t('feedback.emptyMessage') }, { status: 400 });
        }

        // 4. Insert Feedback
        const feedbackRes = await transactionClient.query(
            `INSERT INTO feedbacks (actor, message) VALUES ($1, $2) RETURNING id`,
            [user.uid, message]
        );

        // 5. Notify Admins
        try {
            const adminRes = await transactionClient.query(`SELECT id FROM users WHERE is_admin = true`);
            const admins = adminRes.rows;

            // Truncate message for notification body
            const truncatedMessage = message.length > 100 ? message.substring(0, 100) + '...' : message;

            for (const admin of admins) {
                // Determine user identifier (name or partially hidden ID if needed, but for admin notification ID is fine)
                // Let's just say "User <ID>"

                await createNotification({
                    client: transactionClient,
                    type: 'new_feedback',
                    title: 'New Feedback Received',
                    message: `From User ${user.uid}: ${truncatedMessage}`,
                    userId: admin.id,
                    openLink: '/',
                    entityType: 'feedbacks',
                    entityId: feedbackRes.rows[0].id,
                    role: 'global' as any
                } as any);
            }
        } catch (notifyErr) {
            console.error("Failed to notify admins:", notifyErr);
            // Don't fail the request
        }

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error("Feedback API Error:", error);
        // If we have a client, try to get translation, otherwise fall back to generic
        if (transactionClient) {
            try {
                const t = await getTranslationForUser(userIdForTranslation || 'en', transactionClient);
                return NextResponse.json({ error: t('api.errors.internalError') }, { status: 500 });
            } catch (e) {
                return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
            }
        }
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });

    } finally {
        if (transactionClient) {
            transactionClient.release();
        }
    }
}
