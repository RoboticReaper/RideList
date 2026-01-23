import { NextResponse } from 'next/server';
import { pool } from '@/app/api/lib/db';
import { verifyUserFromRequest } from '@/app/api/lib/verifyUser';
import { getTranslationForUser, getTranslation } from '@/app/api/lib/i18n';

export async function GET(
    req: Request,
    { params }: { params: Promise<{ rideId: string }> }
) {
    const { rideId } = await params;
    const client = await pool.connect();

    try {
        const user = await verifyUserFromRequest(req.headers.get('authorization') ?? undefined);
        if (!user || !user.uid) {
            const t = await getTranslation('en');
            return NextResponse.json({ error: t('api.errors.unauthorized') }, { status: 401 });
        }
        const userId = user.uid;

        // 1. Check Trip Existence & Driver
        const tripRes = await client.query('SELECT driver FROM trips WHERE id = $1', [rideId]);
        if (tripRes.rowCount === 0) {
            const t = await getTranslationForUser(userId, client);
            return NextResponse.json({ error: t('api.errors.tripNotFound') }, { status: 404 });
        }

        const isDriver = tripRes.rows[0].driver === userId;

        // 2. Check Rider Booking (if not driver)
        let isRider = false;
        let bookingStatus = null;
        if (!isDriver) {
            // Check if user has ANY booking for this trip (active or not)
            // If they have multiple (e.g. cancelled then re-booked), we usually care about the valid one or most recent.
            // Let's grab the most recent one.
            const bookingRes = await client.query(`
                SELECT status 
                FROM bookings 
                WHERE trip = $1 AND rider = $2 
                ORDER BY created_at DESC 
                LIMIT 1
            `, [rideId, userId]);

            if ((bookingRes.rowCount ?? 0) > 0) {
                isRider = true;
                bookingStatus = bookingRes.rows[0].status;
            }

            if (!isRider) {
                const t = await getTranslationForUser(userId, client);
                return NextResponse.json({ error: t('api.errors.forbidden') }, { status: 403 });
            }
        }

        // 3. Fetch Messages
        let query = '';
        let values: any[] = [];

        if (isDriver) {
            // Driver sees ALL messages for this trip
            query = `
                SELECT * 
                FROM trip_messages 
                WHERE trip_id = $1 
                ORDER BY created_at ASC
            `;
            values = [rideId];
        } else {
            // Rider visibility rules
            // 1. Announcements (driver -> all)
            // 2. Questions created by ME
            // 3. Followups created by ME
            // 4. Private Answers/DMs where receiver is ME
            // 5. Public Answers (driver -> all)
            // 6. Original Questions (that might not be mine) if they are parent to a Public Answer

            // Logic for #6:
            // We want message M where M is parent of some A, and A.message_type = 'answer_public'.
            // This effectively exposes the question context for a public answer.

            query = `
                WITH public_thread_parents AS (
                    SELECT parent_message_id 
                    FROM trip_messages 
                    WHERE trip_id = $1 
                      AND message_type = 'answer_public'
                      AND parent_message_id IS NOT NULL
                )
                SELECT 
                    id,
                    trip_id,
                    -- Anonymize sender if it's not the current user and it's a question 
                    CASE 
                        WHEN sender_id = $2 THEN sender_id 
                        WHEN sender_role = 'driver' THEN sender_id
                        -- If I didn't write it, and it's not the driver, hide the ID
                        ELSE NULL 
                    END as sender_id,
                    sender_role,
                    message_type,
                    parent_message_id,
                    receiver_id,
                    content,
                    created_at,
                    deleted
                FROM trip_messages 
                WHERE trip_id = $1
                  AND (
                    message_type IN ('announcement', 'answer_public') -- Broadcasts
                    OR sender_id = $2 -- My sent messages
                    OR receiver_id = $2 -- Targeted to me
                    OR id IN (SELECT parent_message_id FROM public_thread_parents) -- Context for public answers
                  )
                ORDER BY created_at ASC
            `;
            values = [rideId, userId];
        }

        const messagesRes = await client.query(query, values);

        // Enrich messages with sender info if needed? 
        // For now, let's just return the raw message objects. 
        // The sender_id is there. Frontend can resolve names if it has data, 
        // or we might need to join user profiles. 
        // Given existing patterns, we often assume caller has context or we might want to attach minimal name info.
        // However, user privacy is important.
        // If it's a public answer to another rider's question, do we show that rider's name?
        // Usually "Rider asked:" is enough, or redact name.
        // Let's stick to returning data. The frontend likely knows current user's ID and Driver's ID.
        // Other riders' names might be obscured.

        // Optimization: If we need names/roles, maybe join or fetch.
        // For 'driver', we know it's the driver.
        // For 'rider', it's active riders.
        // Let's keep it simple for MVP as per prompt strictly asking for route.

        return NextResponse.json({
            messages: messagesRes.rows,
            role: isDriver ? 'driver' : 'rider',
            booking_status: bookingStatus
        });

    } catch (error) {
        console.error('Error fetching chat messages:', error);
        const t = await getTranslation('en');
        return NextResponse.json({ error: t('api.errors.internalError') }, { status: 500 });
    } finally {
        client.release();
    }
}

export async function POST(
    req: Request,
    { params }: { params: Promise<{ rideId: string }> }
) {
    const { rideId } = await params;
    const client = await pool.connect();

    try {
        const user = await verifyUserFromRequest(req.headers.get('authorization') ?? undefined);
        if (!user || !user.uid) {
            const t = await getTranslation('en');
            return NextResponse.json({ error: t('api.errors.unauthorized') }, { status: 401 });
        }
        const userId = user.uid;
        const t = await getTranslationForUser(userId, client);

        const body = await req.json();
        const { content, message_type, parent_message_id, receiver_id } = body;

        if (!content || !content.trim()) {
            return NextResponse.json({ error: t('api.errors.messageEmpty') }, { status: 400 });
        }

        // 1. Determine Role & Status
        const tripCheck = await client.query('SELECT driver, status FROM trips WHERE id = $1', [rideId]);
        if (tripCheck.rowCount === 0) {
            return NextResponse.json({ error: t('api.errors.tripNotFound') }, { status: 404 });
        }
        const tripRow = tripCheck.rows[0];
        const isDriver = tripRow.driver === userId;
        const tripStatus = tripRow.status;

        let senderRole = '';

        if (isDriver) {
            senderRole = 'driver';
            // Driver Write Access Rules
            // Active Trip statuses: 'bookable', 'locked', 'full', 'departed'
            const activeTripStatuses = ['bookable', 'locked', 'full', 'departed'];
            if (!activeTripStatuses.includes(tripStatus)) {
                return NextResponse.json({ error: t('api.errors.tripReadOnly') }, { status: 403 });
            }

            // Allowed message types for Driver
            const allowedTypes = ['announcement', 'dm_private', 'answer_private', 'answer_public'];
            if (!allowedTypes.includes(message_type)) {
                return NextResponse.json({ error: t('api.errors.invalidMessageType') }, { status: 400 });
            }

            // Validation for types
            if (message_type === 'announcement') {
                // Must NOT have receiver or parent
                if (receiver_id || parent_message_id) {
                    return NextResponse.json({ error: t('api.errors.invalidMessageFormat') }, { status: 400 });
                }
            } else if (message_type === 'dm_private') {
                if (!receiver_id) {
                    return NextResponse.json({ error: t('api.errors.missingReceiver') }, { status: 400 });
                }
            } else if (['answer_private', 'answer_public'].includes(message_type)) {
                if (!parent_message_id) {
                    return NextResponse.json({ error: t('api.errors.missingParent') }, { status: 400 });
                }
                // For answer_private, better to ensure receiver_id is set to the original question asker? 
                // Or we can infer it. SQL just needs receiver_id for private visibility constraint.
                if (message_type === 'answer_private' && !receiver_id) {
                    return NextResponse.json({ error: t('api.errors.missingReceiver') }, { status: 400 });
                }
            }

        } else {
            senderRole = 'rider';
            // Rider Write Access Rules
            // 1. Check Booking Status
            const bookingRes = await client.query(`
                SELECT status 
                FROM bookings 
                WHERE trip = $1 AND rider = $2 
                ORDER BY created_at DESC 
                LIMIT 1
            `, [rideId, userId]);

            if ((bookingRes.rowCount ?? 0) === 0) {
                return NextResponse.json({ error: t('api.errors.forbidden') }, { status: 403 });
            }
            const bookingStatus = bookingRes.rows[0].status;

            // Active Rider statuses
            const activeBookingStatuses = [
                'waiting_approval',
                'joined_with_pay_window',
                'pending_pay_confirmation_from_driver',
                'confirmed'
            ];

            if (!activeBookingStatuses.includes(bookingStatus)) {
                // Read-only for other statuses
                return NextResponse.json({ error: t('api.errors.chatReadOnly') }, { status: 403 });
            }

            // Allowed message types for Rider
            const allowedTypes = ['question', 'followup'];
            if (!allowedTypes.includes(message_type)) {
                return NextResponse.json({ error: t('api.errors.invalidMessageType') }, { status: 400 });
            }

            if (message_type === 'followup' && !parent_message_id) {
                return NextResponse.json({ error: t('api.errors.missingParent') }, { status: 400 });
            }

            // Questions usually don't have receiver_id explicitly set to driver in input (it's implicit),
            // but the DB constraint says:
            // question -> receiver_id IS NULL (broadcasting to driver, effectively)
            // followup -> receiver_id IS NOT NULL? Wait.

            // Let's check alter_tables.sql constraints:
            // Top-level: 'question' -> receiver_id IS NULL. (Correct, implicit to driver)
            // 'followup' -> receiver_id IS NOT NULL.
            // Wait, if a rider follows up on a thread... who is the receiver? The driver.

            // So if I am a rider creating a followup, I MUST set receiver_id = Driver?
            // Or does the backend set it?
            // "only visible between driver and the asking rider"

            // If the message is 'followup', constraint says receiver_id IS NOT NULL.
            // If I am replying to a thread, the thread is between me and driver. 
            // So receiver is driver.
            // Let's resolve driver ID.
        }

        // Logic to populate receiver_id if needed
        let finalReceiverId = receiver_id;

        if (senderRole === 'rider') {
            // If message is 'followup', we must target the driver? 
            // Or is it targeted to the thread owner?
            // If I am the rider, I am the thread owner. So I am talking to the driver.
            // DB Constraint: 'followup' requires receiver_id according to CHECK constraint `trip_messages_receiver_rules`:
            // message_type IN ('dm_private', 'followup', 'answer_private') -> receiver_id IS NOT NULL

            // So yes, for 'followup', we must set receiver_id.
            // For 'question', receiver_id must be NULL.

            if (message_type === 'question') {
                finalReceiverId = null;
            } else if (message_type === 'followup') {
                // Determine driver ID
                // We already fetched tripRow.driver
                finalReceiverId = tripRow.driver;
            }
        }

        // Fix: Explicitly force receiver_id to null for public message types
        if (['announcement', 'answer_public'].includes(message_type)) {
            finalReceiverId = null;
        }

        const insertQuery = `
            INSERT INTO trip_messages (
                trip_id, sender_id, sender_role, message_type, 
                content, parent_message_id, receiver_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `;

        const inserted = await client.query(insertQuery, [
            rideId, userId, senderRole, message_type,
            content, parent_message_id || null, finalReceiverId || null
        ]);

        return NextResponse.json(inserted.rows[0]);

    } catch (error) {
        console.error('Error posting chat message:', error);
        const t = await getTranslation('en'); // fallback
        return NextResponse.json({ error: t('api.errors.internalError') }, { status: 500 });
    } finally {
        client.release();
    }
}
