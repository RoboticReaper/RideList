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

        // Query upcoming trips
        let query = `
            SELECT 
                t.id,
                t.from_input_text,
                t.to_input_text,
                t.departure_time,
                t.status,
                t.driver as driver_id,
                t.start_check_in,
                t.seats_taken,
                t.total_seats,
                t.price,
                c.make,
                c.model,
                c.plate,
                c.id as car_id,
                c.color,
                c.pic1, c.pic2, c.pic3, c.pic4,
                pg.phone as driver_phone
            FROM trips t
            LEFT JOIN cars c ON t.car = c.id
            LEFT JOIN profile_global pg ON t.driver = pg.id
            WHERE t.driver = $1
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

        // Pre-fetch check: Find trips that match criteria to clean up their bookings
        // Logic: 
        // 1. We are about to fetch trips for this driver.
        // 2. We want to ensure 'seats_taken' is accurate.
        // 3. We can't easily know EXACTLY which trips the main query will return without running it (due to pagination/sorting).
        // 4. STRATEGY: Run the main query. Get trips. Check their bookings. IF any changed, Re-run query (or update locally).
        // Since we need 'seats_taken' to be correct, and checkAndProcessPayWindowTimeout updates 'seats_taken', re-running or local update is needed.
        // Re-running is safest for consistency but doubles DB load. 
        // Local update of 'seats_taken' is complex because we need to know HOW MANY bookings timed out for each trip.
        // Let's do: Fetch -> Check -> Update Local

        const res = await client.query(query, params);
        let trips = res.rows;

        const tripIds = trips.map((t: any) => t.id);

        // Lazy Check-in and Cutoff (Iterate all trips)
        for (const trip of trips) {
            const checkInStarted = await checkAndProcessCheckInStart(client, trip.id);
            if (checkInStarted) {
                trip.start_check_in = true;
            }

            const s = await checkAndProcessTripCutoff(client, trip.id);
            if (s !== trip.status) {
                trip.status = s;
            }
        }

        if (tripIds.length > 0) {
            const timeouts = await client.query(
                "SELECT id, trip FROM bookings WHERE trip = ANY($1) AND status = 'joined_with_pay_window'",
                [tripIds]
            );

            const tripsToRefresh = new Set<string>();

            for (const row of timeouts.rows) {
                const newStatus = await checkAndProcessPayWindowTimeout(client, row.id);
                if (newStatus === 'pay_timeout') {
                    tripsToRefresh.add(row.trip);
                }
            }

            // If any trips were affected, we should update their seats_taken in our local list
            // or re-fetch. Re-fetching specific trips might be easier.
            if (tripsToRefresh.size > 0) {
                // Optimization: Just update local seats_taken if we know count.
                // But we don't know exactly how many seats were released (seats_booked varies).
                // So let's re-fetch the affected trips seats_taken.
                const refreshRes = await client.query(
                    "SELECT id, seats_taken FROM trips WHERE id = ANY($1)",
                    [Array.from(tripsToRefresh)]
                );

                // Update local map
                const freshData = new Map();
                refreshRes.rows.forEach((r: any) => freshData.set(r.id, r.seats_taken));

                trips = trips.map((t: any) => {
                    if (freshData.has(t.id)) {
                        return { ...t, seats_taken: freshData.get(t.id) };
                    }
                    return t;
                });
            }
        }

        let nextCursor = null;
        if (trips.length === limit) {
            nextCursor = trips[trips.length - 1].departure_time;
        }

        return NextResponse.json({ trips, nextCursor });

    } catch (error: any) {
        console.error("Fetch Upcoming Trips Error:", error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    } finally {
        client.release();
    }
}
