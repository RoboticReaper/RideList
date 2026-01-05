import { NextResponse } from 'next/server';
import { pool } from '@/app/api/lib/db';
import { verifyUserFromRequest } from '@/app/api/lib/verifyUser';

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

        // Query logic:
        // We want trips where the user had a booking, AND either:
        // 1. The trip is done/cancelled
        // OR
        // 2. The booking was cancelled/removed/paid-left/unpaid-left (regardless of trip status)

        // As defined in the prompt: "complement of their corresponding upcoming trips"
        // Upcoming trips query was: 
        // WHERE lb.status IN ('waiting_approval', 'joined_with_pay_window', 'pending_pay_confirmation_from_driver', 'confirmed')
        // AND t.status NOT IN ('done', 'cancelled')

        // So History is:
        // (lb.status NOT IN (...) OR t.status IN ('done', 'cancelled'))

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
                t.price,
                lb.status as booking_status,
                lb.seats_booked,
                lb.id as booking_id,
                lb.big_luggage,
                lb.small_luggage
            FROM latest_bookings lb
            JOIN trips t ON lb.trip = t.id
            WHERE (
                lb.status NOT IN ('waiting_approval', 'joined_with_pay_window', 'pending_pay_confirmation_from_driver', 'confirmed')
                OR 
                t.status IN ('done', 'cancelled', 'aborted')
            )
        `;

        const params: any[] = [user.uid];
        let paramIndex = 2;

        if (cursor) {
            query += ` AND t.departure_time < $${paramIndex}`;
            params.push(cursor);
            paramIndex++;
        }

        query += ` ORDER BY t.departure_time DESC LIMIT $${paramIndex}`;
        params.push(limit);

        const res = await client.query(query, params);
        const trips = res.rows;

        let nextCursor = null;
        if (trips.length === limit) {
            nextCursor = trips[trips.length - 1].departure_time;
        }

        return NextResponse.json({ trips, nextCursor });

    } catch (error: any) {
        console.error("Fetch Rider History Error:", error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    } finally {
        client.release();
    }
}
