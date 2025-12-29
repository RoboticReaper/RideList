import { NextResponse } from 'next/server';
import { pool } from '@/app/api/lib/db';
import { verifyUserFromRequest } from '@/app/api/lib/verifyUser';
import { checkAndProcessPayWindowTimeout } from '@/app/api/lib/payWindow';

export async function GET(
    req: Request,
    { params }: { params: Promise<{ rideId: string }> }
) {
    const { rideId } = await params;
    const client = await pool.connect();

    try {
        const user = await verifyUserFromRequest(
            req.headers.get('authorization') ?? undefined
        );

        if (!user || !user.uid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Verify Driver Ownership
        const tripCheck = await client.query('SELECT driver FROM trips WHERE id = $1', [rideId]);
        if (tripCheck.rowCount === 0) {
            return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
        }
        if (tripCheck.rows[0].driver !== user.uid) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Lazy Cleanup of Timed Out Bookings
        const timeouts = await client.query(
            "SELECT id FROM bookings WHERE trip = $1 AND status = 'joined_with_pay_window'",
            [rideId]
        );
        for (const row of timeouts.rows) {
            await checkAndProcessPayWindowTimeout(client, row.id);
        }

        // Fetch Bookings with Rider Info
        const query = `
            SELECT 
                b.id,
                b.seats_booked,
                b.big_luggage,
                b.small_luggage,
                b.status,
                b.created_at,
                pg.name as rider_name,
                pg.photo_url as rider_photo_url,
                pr.rating_cached as rider_rating,
                pr.completed_rides as rider_completed_rides
            FROM bookings b
            JOIN profile_global pg ON b.rider = pg.id
            LEFT JOIN profile_rider pr ON b.rider = pr.id
            WHERE b.trip = $1
            ORDER BY b.created_at DESC
        `;

        const res = await client.query(query, [rideId]);

        return NextResponse.json({ bookings: res.rows });

    } catch (error: any) {
        console.error("Fetch Bookings Error:", error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
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
        const user = await verifyUserFromRequest(
            req.headers.get('authorization') ?? undefined
        );

        if (!user || !user.uid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { seats_booked, big_luggage, small_luggage, preferred_pickup_time } = body;

        // Basic Validation
        if (!seats_booked || seats_booked < 1) {
            return NextResponse.json({ error: 'Must book at least 1 seat' }, { status: 400 });
        }

        await client.query('BEGIN');

        // Lazy Cleanup of Timed Out Bookings
        const timeouts = await client.query(
            "SELECT id FROM bookings WHERE trip = $1 AND status = 'joined_with_pay_window'",
            [rideId]
        );
        for (const row of timeouts.rows) {
            await checkAndProcessPayWindowTimeout(client, row.id);
        }

        // Fetch Trip & Rules & Driver
        // Locking row for consistency
        const tripQuery = `
            SELECT 
                t.driver,
                t.total_seats,
                t.seats_taken,
                t.departure_time,
                tr.big_luggage_lim,
                tr.small_luggage_lim,
                tr.auto_accept,
                tr.departure_time_flexibility
            FROM trips t
            LEFT JOIN trip_rules tr ON t.id = tr.id
            WHERE t.id = $1
            FOR UPDATE OF t
        `;
        const tripRes = await client.query(tripQuery, [rideId]);

        if (tripRes.rowCount === 0) {
            await client.query('ROLLBACK');
            return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
        }

        const trip = tripRes.rows[0];

        // 1. Check if user is driver
        if (trip.driver === user.uid) {
            await client.query('ROLLBACK');
            return NextResponse.json({ error: 'You cannot book your own trip' }, { status: 400 });
        }

        // 2. Check seats available
        const seatsAvailable = trip.total_seats - trip.seats_taken;
        if (seats_booked > seatsAvailable) {
            await client.query('ROLLBACK');
            return NextResponse.json({ error: `Not enough seats. Only ${seatsAvailable} left.` }, { status: 400 });
        }

        // 3. Check luggage limits
        // Limits are PER PERSON (per seat booked)
        const totalBigAllowed = (trip.big_luggage_lim || 0) * seats_booked;
        const totalSmallAllowed = (trip.small_luggage_lim || 0) * seats_booked;

        if (big_luggage > totalBigAllowed) {
            await client.query('ROLLBACK');
            return NextResponse.json({ error: `Too many big bags. Max allowed for ${seats_booked} seats is ${totalBigAllowed}.` }, { status: 400 });
        }
        if (small_luggage > totalSmallAllowed) {
            await client.query('ROLLBACK');
            return NextResponse.json({ error: `Too many small bags. Max allowed for ${seats_booked} seats is ${totalSmallAllowed}.` }, { status: 400 });
        }

        // 4. Check pickup time flexibility
        if (preferred_pickup_time) {
            const originalTime = new Date(trip.departure_time).getTime();
            const preferredTime = new Date(preferred_pickup_time).getTime();

            // Parse flexibility (stored as JSON: { hours: number, minutes: number })
            let rangeMs = 15 * 60 * 1000; // Default 15 mins
            if (trip.departure_time_flexibility) {
                const f = trip.departure_time_flexibility;
                const h = f.hours || 0;
                const m = f.minutes || 0;
                rangeMs = (h * 60 * 60 * 1000) + (m * 60 * 1000);
            }

            const diff = Math.abs(preferredTime - originalTime);
            if (diff > rangeMs) {
                await client.query('ROLLBACK');
                return NextResponse.json({ error: 'Preferred pickup time is outside the driver\'s flexibility range.' }, { status: 400 });
            }
        }


        // 5. Determine Status & Check Existing Bookings

        // Fetch USER's latest booking for this trip
        const invalidStatusCheck = await client.query(
            "SELECT status FROM bookings WHERE trip = $1 AND rider = $2 ORDER BY created_at DESC LIMIT 1",
            [rideId, user.uid]
        );

        // Default: undefined if never booked
        let existingStatus: string | undefined;
        if (invalidStatusCheck.rowCount && invalidStatusCheck.rowCount > 0) {
            existingStatus = invalidStatusCheck.rows[0].status;
        }

        // Constraints:
        // 1. If currently active, block.
        // Active = NOT (pay_timeout, removed, left_paid, left_unpaid, cancelled)
        // If it is NOT in the inactive list, it is ACTIVE.

        const inactiveStatuses = ['pay_timeout', 'removed', 'left_paid', 'left_unpaid', 'cancelled'];

        if (existingStatus) {
            if (existingStatus === 'cancelled') {
                await client.query('ROLLBACK');
                return NextResponse.json({ error: 'You cannot rejoin this trip.' }, { status: 400 });
            }

            if (!inactiveStatuses.includes(existingStatus)) {
                await client.query('ROLLBACK');
                return NextResponse.json({ error: 'You already have an active booking on this trip.' }, { status: 400 });
            }
        }

        let status = 'waiting_approval';

        // Auto-accept Check
        // If they were previously removed, do NOT auto-accept (safety)
        const wasRemoved = existingStatus === 'removed'; // reusing existing fetch checks latest, but removalCheck logic was "if EVER removed".
        // The original logic was: SELECT 1 FROM bookings WHERE ... status = 'removed'. 
        // Let's keep the detailed check for "EVER removed" if we want to be strict, or just use latest.
        // If I was removed 5 times ago, maybe I shouldn't be auto-accepted now? 
        // I'll stick to the original "EVER removed" check for auto-accept safety, or simpler: 
        // If latest was removed, definitely don't auto accept.

        if (trip.auto_accept && !wasRemoved) {
            status = 'joined_with_pay_window';
        }


        // 6. Insert Booking
        const insertQuery = `
            INSERT INTO bookings (trip, rider, seats_booked, big_luggage, small_luggage, preferred_pickup_time, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id
        `;

        const insertRes = await client.query(insertQuery, [
            rideId,
            user.uid,
            seats_booked,
            big_luggage || 0,
            small_luggage || 0,
            preferred_pickup_time || null,
            status
        ]);

        let bookingId = insertRes.rows[0].id;

        // 7. Update Trip Seats (ONLY if auto-accepted)
        if (status === 'joined_with_pay_window') {
            await client.query('UPDATE trips SET seats_taken = seats_taken + $1 WHERE id = $2', [seats_booked, rideId]);
        }

        // 8. Create initial log in booking status history
        const statusHistoryQuery = `
            INSERT INTO booking_status_history (booking_id, actor_id, new_status, created_at)
            VALUES ($1, $2, $3, NOW())
        `;
        await client.query(statusHistoryQuery, [bookingId, user.uid, status]);

        await client.query('COMMIT');

        return NextResponse.json({
            success: true,
            bookingId: bookingId,
            status: status
        });

    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error("Create Booking Error:", error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    } finally {
        client.release();
    }
}
