import { NextResponse } from 'next/server';
import { pool } from '@/app/api/lib/db';
import { verifyUserFromRequest } from '@/app/api/lib/verifyUser';
import { checkAndProcessPayWindowTimeout } from '@/app/api/lib/payWindow';
import { checkAndProcessCheckInStart } from '@/app/api/lib/checkIn';
import { checkAndProcessTripCutoff } from '@/app/api/lib/tripCutoff';

export async function GET(req: Request) {
    const client = await pool.connect();

    try {
        const user = await verifyUserFromRequest(
            req.headers.get('authorization') ?? undefined
        );

        if (!user || !user.uid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const limit = parseInt(searchParams.get('limit') || '10');
        const cursor = searchParams.get('cursor'); // ISO date string

        // Query upcoming trips where the user has ANY booking history
        // We want:
        // 1. All trips where user has a booking
        // 2. Uniqueness: if multiple bookings for same trip, take the latest one (by created_at)
        // 3. No status filtering (show cancelled, removed, etc)

        // Using DISTINCT ON to get latest booking per trip
        let query = `
            WITH latest_bookings AS (
                SELECT DISTINCT ON (trip) 
                    id, 
                    trip, 
                    status, 
                    seats_booked, 
                    big_luggage, 
                    small_luggage, 
                    created_at
                FROM bookings
                WHERE rider = $1
                ORDER BY trip, created_at DESC
            )
            SELECT 
                t.id,
                t.from_text,
                t.to_text,
                t.departure_time,
                t.status as trip_status,
                t.start_check_in,
                t.price,
                t.return_time,
                t.trip_title,
                lb.status as booking_status,
                lb.seats_booked,
                lb.id as booking_id,
                lb.big_luggage,
                lb.small_luggage
            FROM latest_bookings lb
            JOIN trips t ON lb.trip = t.id
            WHERE lb.status IN ('waiting_approval', 'joined_with_pay_window', 'pending_pay_confirmation_from_driver', 'confirmed')
            AND t.status NOT IN ('done', 'cancelled', 'aborted')
        `;

        const params: any[] = [user.uid];
        let paramIndex = 2;

        if (cursor) {
            query += ` AND t.departure_time > $${paramIndex}`;
            params.push(cursor);
            paramIndex++;
        }

        query += ` ORDER BY t.departure_time ASC LIMIT $${paramIndex}`;
        params.push(limit);

        const res = await client.query(query, params);
        const trips = res.rows;

        // Lazy Cleanup: Check for pay window timeouts on returned bookings
        // Note: 'status' in trips row corresponds to booking status (aliased as booking_status)
        for (const trip of trips) {
            // Lazy Check-in Start
            await checkAndProcessCheckInStart(client, trip.id);

            // Lazy Trip Cutoff Check
            const s = await checkAndProcessTripCutoff(client, trip.id);
            if (s !== trip.trip_status) {
                trip.trip_status = s;
            }

            if (trip.booking_status === 'joined_with_pay_window' && trip.booking_id) {
                // Check and process (updates DB if needed)
                const newStatus = await checkAndProcessPayWindowTimeout(client, trip.booking_id);
                // Update local representation
                if (newStatus !== trip.booking_status) {
                    trip.booking_status = newStatus;
                }
            }
        }

        let nextCursor = null;
        if (trips.length === limit) {
            nextCursor = trips[trips.length - 1].departure_time;
        }

        return NextResponse.json({ trips, nextCursor });

    } catch (error: any) {
        console.error("Fetch Rider Upcoming Trips Error:", error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    } finally {
        client.release();
    }
}
