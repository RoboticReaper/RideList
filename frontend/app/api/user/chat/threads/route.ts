import { NextResponse } from 'next/server';
import { pool } from '@/app/api/lib/db';
import { verifyUserFromRequest } from '@/app/api/lib/verifyUser';
import { getTranslation } from '@/app/api/lib/i18n';
import { redactName } from '@/app/api/lib/redactName';

export async function GET(req: Request) {
    const client = await pool.connect();

    try {
        const user = await verifyUserFromRequest(req.headers.get('authorization') ?? undefined);
        if (!user || !user.uid) {
            const t = await getTranslation('en');
            return NextResponse.json({ error: t('api.errors.unauthorized') }, { status: 401 });
        }

        const userId = user.uid;

        // Fetch all distinct users the current user has exchanged DMs with,
        // along with the most recent message in their conversation.
        const query = `
            WITH RankedMessages AS (
                SELECT 
                    m.id,
                    m.sender_id,
                    m.receiver_id,
                    m.content,
                    m.message_type,
                    m.created_at,
                    CASE 
                        WHEN m.sender_id = $1 THEN m.receiver_id 
                        ELSE m.sender_id 
                    END as other_user_id,
                    ROW_NUMBER() OVER (
                        PARTITION BY 
                            CASE 
                                WHEN m.sender_id = $1 THEN m.receiver_id 
                                ELSE m.sender_id 
                            END
                        ORDER BY m.created_at DESC
                    ) as rn
                FROM dm_messages m
                WHERE (m.sender_id = $1 OR m.receiver_id = $1)
                  AND m.deleted = false
            )
            SELECT 
                rm.id as last_message_id,
                rm.other_user_id,
                rm.content as last_message_content,
                rm.message_type as last_message_type,
                rm.created_at as last_message_at,
                pg.name as other_user_name,
                pg.photo_url as other_user_photo_url,
                -- Verify if there is a previous booking for name redaction
                CASE 
                    WHEN EXISTS (
                        SELECT 1 FROM bookings b
                        JOIN trips t ON b.trip = t.id
                        WHERE ((t.driver = $1 AND b.rider = pg.id) OR (t.driver = pg.id AND b.rider = $1))
                          AND b.status != 'removed'
                    ) THEN true 
                    ELSE false 
                END as has_previous_booking
            FROM RankedMessages rm
            JOIN profile_global pg ON rm.other_user_id = pg.id
            WHERE rm.rn = 1
            ORDER BY rm.created_at DESC
        `;

        const res = await client.query(query, [userId]);

        const threads = res.rows.map(row => {
            const isVisible = row.has_previous_booking;

            return {
                otherUserId: row.other_user_id,
                otherUserName: isVisible ? row.other_user_name : redactName(row.other_user_name),
                otherUserPhotoUrl: row.other_user_photo_url,
                lastMessage: {
                    id: row.last_message_id,
                    content: row.last_message_content,
                    type: row.last_message_type,
                    createdAt: row.last_message_at
                }
            };
        });

        return NextResponse.json({ threads });
    } catch (error) {
        console.error('Error fetching DM threads:', error);
        const t = await getTranslation('en');
        return NextResponse.json({ error: t('api.errors.internalError') }, { status: 500 });
    } finally {
        client.release();
    }
}
