import { NextResponse } from 'next/server';
import { pool } from '@/app/api/lib/db';
import { verifyUserFromRequest } from '@/app/api/lib/verifyUser';
import { checkAndProcessPayWindowTimeout } from '@/app/api/lib/payWindow';
import { checkAndProcessCheckInStart } from '@/app/api/lib/checkIn';
import { createNotification } from '@/app/api/lib/createNotification';
import { getTranslationForUser } from '@/app/api/lib/i18n';
import { processPaymentEvidence } from '@/app/api/lib/processPaymentEvidence';

export async function POST(
    req: Request,
    { params }: { params: Promise<{ bookingId: string }> }
) {
    const { bookingId } = await params;
    const client = await pool.connect();

    try {
        const user = await verifyUserFromRequest(
            req.headers.get('authorization') ?? undefined
        );

        const t = await getTranslationForUser(user?.uid ?? null, client);

        if (!user || !user.uid) {
            return NextResponse.json({ error: t('api.errors.unauthorized') }, { status: 401 });
        }

        // Parse body for payment evidence
        const body = await req.json().catch(() => ({}));
        const { payment_evidence_image, payment_evidence_text } = body;

        // Require both payment evidence fields
        if (!payment_evidence_image || typeof payment_evidence_image !== 'string') {
            return NextResponse.json({ error: t('api.errors.paymentEvidenceRequired') }, { status: 400 });
        }
        if (!payment_evidence_text || typeof payment_evidence_text !== 'string' || payment_evidence_text.trim().length === 0) {
            return NextResponse.json({ error: t('api.errors.paymentEvidenceTextRequired') }, { status: 400 });
        }

        await client.query('BEGIN');

        // Lazy Timeout Check
        await checkAndProcessPayWindowTimeout(client, bookingId);

        // Check booking ownership and current status
        // Locking row for consistency
        const bookingQuery = `
            SELECT b.id, b.rider, b.trip, b.status, t.driver
            FROM bookings b
            JOIN trips t ON b.trip = t.id
            WHERE b.id = $1
            FOR UPDATE
        `;
        const bookingRes = await client.query(bookingQuery, [bookingId]);

        if (bookingRes.rowCount === 0) {
            await client.query('ROLLBACK');
            return NextResponse.json({ error: t('api.errors.bookingNotFound') }, { status: 404 });
        }

        const booking = bookingRes.rows[0];

        // Lazy Check-in Start
        await checkAndProcessCheckInStart(client, booking.trip);

        if (booking.rider !== user.uid) {
            await client.query('ROLLBACK');
            return NextResponse.json({ error: t('api.errors.forbidden') }, { status: 403 });
        }

        if (booking.status !== 'joined_with_pay_window') {
            await client.query('ROLLBACK');
            return NextResponse.json({ error: t('api.errors.bookingNotPaymentReady') }, { status: 400 });
        }

        // Process and upload payment evidence image
        let evidenceUrl: string;
        try {
            evidenceUrl = await processPaymentEvidence(payment_evidence_image, bookingId);
        } catch (err) {
            await client.query('ROLLBACK');
            return NextResponse.json({ error: 'Failed to process payment evidence image' }, { status: 400 });
        }

        // Update status and store payment evidence
        const updateQuery = `
            UPDATE bookings
            SET status = 'pending_pay_confirmation_from_driver',
                payment_evidence_url = $2,
                payment_evidence_text = $3
            WHERE id = $1
        `;
        await client.query(updateQuery, [bookingId, evidenceUrl, payment_evidence_text.trim()]);

        const statusHistoryQuery = `
            INSERT INTO booking_status_history (booking_id, actor_id, old_status, new_status)
            VALUES ($1, $2, $3, $4)
        `;
        await client.query(statusHistoryQuery, [bookingId, user.uid, 'joined_with_pay_window', 'pending_pay_confirmation_from_driver']);

        await createNotification({
            client,
            type: 'payment_marked',
            titleKey: 'notifications.types.payment_marked.title',
            messageKey: 'notifications.types.payment_marked.message',
            userId: booking.driver,
            entityType: 'bookings',
            entityId: bookingId,
            openLink: `/dashboard/${booking.trip}`,
            role: 'driver'
        })

        await client.query('COMMIT');

        return NextResponse.json({ success: true });

    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error("Mark Payment Sent Error:", error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    } finally {
        client.release();
    }
}
