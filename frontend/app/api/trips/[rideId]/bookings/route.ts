import { NextResponse } from 'next/server';
import { pool } from '@/app/api/lib/db';
import { verifyUserFromRequest } from '@/app/api/lib/verifyUser';

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
