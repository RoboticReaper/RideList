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

        // Query history trips (done or cancelled)
        let query = `
            SELECT 
                t.id,
                t.from_input_text,
                t.to_input_text,
                t.departure_time,
                t.status,
                t.start_check_in,
                t.seats_taken,
                t.total_seats,
                t.price,
                c.make,
                c.model,
                c.plate,
                c.color,
                c.pic1, c.pic2, c.pic3, c.pic4,
                pg.phone as driver_phone
            FROM trips t
            LEFT JOIN cars c ON t.car = c.id
            LEFT JOIN profile_global pg ON t.driver = pg.id
            WHERE t.driver = $1
            AND t.status IN ('done', 'cancelled', 'aborted')
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
        console.error("Fetch Driver History Error:", error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    } finally {
        client.release();
    }
}
