import { NextResponse } from 'next/server';
import { pool } from '@/app/api/lib/db';
import { verifyUserFromRequest } from '@/app/api/lib/verifyUser';
import { getTranslationForUser } from '@/app/api/lib/i18n';
import { redactName } from '@/app/api/lib/redactName';
import dayjs, { CHICAGO_TZ } from '@/utils/dateUtils';

// Grid size in degrees (must match trends API)
const GRID_SIZE = 0.01;

export async function GET(req: Request) {
    const client = await pool.connect();

    try {
        const url = new URL(req.url);
        const origin_lat = url.searchParams.get('origin_lat');
        const origin_lng = url.searchParams.get('origin_lng');
        const dest_lat = url.searchParams.get('dest_lat');
        const dest_lng = url.searchParams.get('dest_lng');
        const date = url.searchParams.get('date');
        const time_category = url.searchParams.get('time_category');

        if (!origin_lat || !origin_lng || !dest_lat || !dest_lng || !date || !time_category) {
            return NextResponse.json({ error: 'Missing required query parameters' }, { status: 400 });
        }

        // Auth Check (Optional, but required for un-redacted names)
        let userId = null;
        try {
            const user = await verifyUserFromRequest(
                req.headers.get('authorization') ?? undefined
            );
            userId = user?.uid || null;
        } catch (e) {
            // Guest allowed, but names will be redacted
        }

        const t = await getTranslationForUser(userId, client);

        // Calculate the snapped grid coordinates just like ST_SnapToGrid does
        // ST_SnapToGrid(geom, size) rounds coordinates to the nearest multiple of size
        // Since we passed Center lat/lng, we reverse it:
        // Wait, ST_SnapToGrid(geom, 0.01) snaps to the origin.
        // Actually we can just re-create the grids in SQL from the passed center coords, 
        // or just use ST_SnapToGrid on the passed coords directly in the query.
        // If the frontend passed Center = Snap + 0.005, then Center - 0.005 = Snap.
        // BUT the safest way is to snap the Center coords directly since ST_SnapToGrid(Snap + 0.005, 0.01) might round up or down depending on floating point!
        // Actually, in PostgreSQL, ST_SnapToGrid(ST_MakePoint(lng, lat), 0.01) is the official way.
        // Let's just use the exact ST_SnapToGrid function in the query matching the request's original grids.

        const query = `
            SELECT 
                rr.id,
                rr.from_text,
                rr.to_text,
                rr.seats,
                rr.price,
                rr.preferred_time,
                rr.time_flexibility,
                rr.created_at,
                pg.id as requester_id,
                pg.name as requester_name,
                pg.photo_url as requester_photo_url,
                CASE 
                    WHEN $5::text IS NULL THEN false
                    WHEN $5::text = pg.id THEN true
                    WHEN EXISTS (
                        SELECT 1 FROM bookings b
                        JOIN trips t ON b.trip = t.id
                        WHERE ((t.driver = $5 AND b.rider = pg.id) OR (t.driver = pg.id AND b.rider = $5))
                          AND b.status != 'removed'
                    ) THEN true 
                    ELSE false 
                END as has_previous_booking
            FROM ride_requests rr
            JOIN profile_global pg ON rr.requester_id = pg.id
            WHERE rr.status = 'active'
              AND rr.expires_at > NOW()
              AND ABS(ST_X(rr.origin_grid) - $1::numeric) < 0.0001
              AND ABS(ST_Y(rr.origin_grid) - $2::numeric) < 0.0001
              AND ABS(ST_X(rr.dest_grid) - $3::numeric) < 0.0001
              AND ABS(ST_Y(rr.dest_grid) - $4::numeric) < 0.0001
              AND (rr.preferred_time AT TIME ZONE 'America/Chicago')::date = $6::date
              AND CASE 
                    WHEN EXTRACT(HOUR FROM rr.preferred_time AT TIME ZONE 'America/Chicago') >= 6 
                         AND EXTRACT(HOUR FROM rr.preferred_time AT TIME ZONE 'America/Chicago') < 12 
                    THEN 'morning'
                    WHEN EXTRACT(HOUR FROM rr.preferred_time AT TIME ZONE 'America/Chicago') >= 12 
                         AND EXTRACT(HOUR FROM rr.preferred_time AT TIME ZONE 'America/Chicago') < 18 
                    THEN 'afternoon'
                    WHEN EXTRACT(HOUR FROM rr.preferred_time AT TIME ZONE 'America/Chicago') >= 18 
                         AND EXTRACT(HOUR FROM rr.preferred_time AT TIME ZONE 'America/Chicago') < 24 
                    THEN 'evening'
                    ELSE 'night'
                  END = $7::text
            ORDER BY rr.preferred_time ASC
        `;

        // The input from frontend is the center lat/lng. 
        // We know Center = Snapped + gridSize/2.
        // So Snapped = Center - gridSize/2. 
        // Let's pass the EXACT snapped coordinates to PostgreSQL to strictly equal rr.origin_grid.
        const origin_snapped_lng = parseFloat(origin_lng) - GRID_SIZE / 2;
        const origin_snapped_lat = parseFloat(origin_lat) - GRID_SIZE / 2;
        const dest_snapped_lng = parseFloat(dest_lng) - GRID_SIZE / 2;
        const dest_snapped_lat = parseFloat(dest_lat) - GRID_SIZE / 2;

        const result = await client.query(query, [
            origin_snapped_lng,
            origin_snapped_lat,
            dest_snapped_lng,
            dest_snapped_lat,
            userId,
            date,
            time_category
        ]);

        const requests = result.rows.map(row => {
            const isVisible = row.has_previous_booking;

            return {
                id: row.id,
                fromText: row.from_text,
                toText: row.to_text,
                seats: row.seats,
                price: row.price ? parseFloat(row.price) : null,
                preferredTime: row.preferred_time,
                timeFlexibility: row.time_flexibility,
                createdAt: row.created_at,
                requester: {
                    id: row.requester_id,
                    name: isVisible ? row.requester_name : redactName(row.requester_name),
                    photoUrl: isVisible ? row.requester_photo_url : null,
                }
            };
        });

        return NextResponse.json({
            success: true,
            requests
        });

    } catch (error: any) {
        console.error("Get Ride Request Details API Error:", error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    } finally {
        client.release();
    }
}
