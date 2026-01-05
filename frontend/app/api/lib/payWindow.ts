
import { PoolClient } from 'pg';

/**
 * Checks if a booking has timed out its pay window.
 * If timed out, updates the booking status to 'pay_timeout', releases the seats, and logs the history.
 * 
 * @param client - The database client (must be active, inside a transaction if you want atomicity with other ops)
 * @param bookingId - The UUID of the booking to check
 * @returns The (potentially updated) status of the booking.
 */
export async function checkAndProcessPayWindowTimeout(client: PoolClient, bookingId: string): Promise<string> {
    try {
        // 1. Fetch relevant details: booking status, creation time of that status, and the trip's pay_window rule
        // We look effectively for the timestamp when it entered 'joined_with_pay_window'
        // But more robustly, we can checking:
        // - Current Status is 'joined_with_pay_window'
        // - The `booking_status_history` entry for when it BECAME 'joined_with_pay_window'
        // - The `trip_rules` for the `pay_window` interval

        const query = `
            WITH booking_info AS (
                SELECT 
                    b.id, 
                    b.status, 
                    b.seats_booked, 
                    b.trip AS trip_id,
                    tr.pay_window,
                    t.status as trip_status
                FROM bookings b
                JOIN trip_rules tr ON b.trip = tr.id
                JOIN trips t ON b.trip = t.id
                WHERE b.id = $1
            ),
            status_start AS (
                SELECT created_at as start_time
                FROM booking_status_history
                WHERE booking_id = $1 AND new_status = 'joined_with_pay_window'
                ORDER BY created_at DESC
                LIMIT 1
            )
            SELECT 
                bi.status,
                bi.seats_booked,
                bi.trip_id,
                bi.pay_window,
                bi.trip_status,
                ss.start_time,
                NOW() as current_time
            FROM booking_info bi
            LEFT JOIN status_start ss ON true
        `;

        const res = await client.query(query, [bookingId]);

        if (res.rowCount === 0) {
            return 'not_found'; // Or throw
        }

        const { status, seats_booked, trip_id, pay_window, start_time, current_time, trip_status } = res.rows[0];

        // optimization: if not in the target status, return immediately
        if (status !== 'joined_with_pay_window') {
            return status;
        }

        // if trip has departed, do not expire
        if (trip_status === 'departed') {
            return status;
        }

        if (!start_time) {
            // Edge case: Should have history if in this status. 
            // If missing, we might assume it just happened or can't timeout? 
            // Let's log warning and return current status.
            console.warn(`Booking ${bookingId} is in joined_with_pay_window but has no history entry.`);
            return status;
        }

        if (!pay_window) {
            // No limit defined
            return status;
        }

        // Calculate deadline
        // Postgres interval + timestamp works in SQL, but let's do comp in JS or SQL. 
        // Let's do a quick SQL check to be timezone safe/interval safe
        const timeoutCheckRes = await client.query(
            `SELECT ($1::timestamptz + $2::interval) < NOW() as is_timed_out`,
            [start_time, pay_window]
        );

        const isTimedOut = timeoutCheckRes.rows[0].is_timed_out;

        if (isTimedOut) {
            console.log(`Booking ${bookingId} timed out (Pay Window: ${JSON.stringify(pay_window)})`);

            // EXECUTE TIMEOUT LOGIC
            // 1. Update Booking
            await client.query(
                `UPDATE bookings SET status = 'pay_timeout' WHERE id = $1`,
                [bookingId]
            );

            // 2. Release Seats
            const releaseRes = await client.query(
                `UPDATE trips SET seats_taken = seats_taken - $1 WHERE id = $2 RETURNING status, seats_taken`,
                [seats_booked, trip_id]
            );

            if (releaseRes.rows.length > 0 && releaseRes.rows[0].status === 'full') {
                await client.query("UPDATE trips SET status = 'bookable', modified_at = NOW() WHERE id = $1", [trip_id]);

                // Log Status Change (Full -> Bookable)
                const { logTripEvent } = await import('@/app/api/lib/tripEvents');
                await logTripEvent({
                    client,
                    tripId: trip_id,
                    actorId: null, // System
                    eventType: 'trip_updated',
                    affectedEntities: ['trips'],
                    changes: { trip: { status: { old: 'full', new: 'bookable' } } }
                });

                // Check cutoff immediately (might re-lock it if past cutoff)
                const { checkAndProcessTripCutoff } = await import('@/app/api/lib/tripCutoff');
                await checkAndProcessTripCutoff(client, trip_id);
            }

            // 3. Log Trip Event (System Cancellation)
            const { logTripEvent } = await import('@/app/api/lib/tripEvents');
            const eventId = await logTripEvent({
                client,
                tripId: trip_id,
                actorId: null, // System
                eventType: 'system_cancelled', // Mapped from requirement: 'system_cancelled' for pay window timeout
                affectedEntities: ['bookings', 'trips'],
                changes: { booking_id: bookingId, seats_released: seats_booked, reason: 'pay_window_timeout' }
            });

            // 4. Log History
            await client.query(
                `INSERT INTO booking_status_history (booking_id, actor_id, old_status, new_status, trigger_event_id)
                 VALUES ($1, NULL, $2, 'pay_timeout', $3)`, // Actor NULL for system
                [bookingId, status, eventId]
            );

            return 'pay_timeout';
        }

        return status;

    } catch (e) {
        console.error("Error in checkAndProcessPayWindowTimeout", e);
        // Fallback: return current status (fail open? or fail closed?)
        // Safer to fail open (don't timeout if DB error)
        // We'll re-throw to let the caller decide if they want to block the request
        throw e;
    }
}
