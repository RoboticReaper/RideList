import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/app/api/lib/db';

// NOTE: Public endpoint (no auth). Do NOT include sensitive fields here (phone, payment_handle, plates, etc.)
export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;

    const startLatStr = searchParams.get('start_lat');
    const startLngStr = searchParams.get('start_lng');
    const endLatStr = searchParams.get('end_lat');
    const endLngStr = searchParams.get('end_lng');
    const dateStr = searchParams.get('date');

    // Required params
    if (!startLatStr || !startLngStr || !endLatStr || !endLngStr || !dateStr) {
        return NextResponse.json({ rides: [] });
    }

    const startLat = Number(startLatStr);
    const startLng = Number(startLngStr);
    const endLat = Number(endLatStr);
    const endLng = Number(endLngStr);

    if (
        !Number.isFinite(startLat) ||
        !Number.isFinite(startLng) ||
        !Number.isFinite(endLat) ||
        !Number.isFinite(endLng)
    ) {
        return NextResponse.json({ rides: [] });
    }

    // Validate date
    const reqDate = new Date(dateStr);
    if (Number.isNaN(reqDate.getTime())) {
        return NextResponse.json({ rides: [] });
    }

    // Pagination guards
    const pageRaw = Number(searchParams.get('page') || '1');
    const page = Number.isFinite(pageRaw) ? Math.max(1, Math.min(100, Math.floor(pageRaw))) : 1;

    const limit = 10;
    const offset = (page - 1) * limit;

    // Optional params
    const bigLuggageStr = searchParams.get('big_luggage');
    const smallLuggageStr = searchParams.get('small_luggage');
    const priceMaxStr = searchParams.get('price_max');
    const paymentMethodsStr = searchParams.get('payment_methods');
    const autoAcceptStr = searchParams.get('auto_accept');

    const client = await pool.connect();
    try {
        // Base params:
        // 1 startLng, 2 startLat, 3 endLng, 4 endLat, 5 reqDate, 6 limit, 7 offset
        const queryParams: any[] = [startLng, startLat, endLng, endLat, reqDate, limit, offset];

        let paramCounter = 8;

        // Important:
        // - include full trips too (viewable but not bookable)
        // - enforce seats availability to avoid stale "bookable" records showing as bookable
        // - constrain results to within 7 calendar day as reqDate
        let whereConditions = `
      t.status IN ('bookable', 'full')
      AND t.departure_time >= date_trunc('day', $5)
      AND t.departure_time <  date_trunc('day', $5) + interval '7 days'
      AND ST_DWithin(t.origin_geog, ST_SetSRID(ST_MakePoint($1, $2), 4326), tr.pickup_radius_meters)
      AND ST_DWithin(t.destination_geog, ST_SetSRID(ST_MakePoint($3, $4), 4326), tr.drop_off_radius_meters)
    `;

        // Optional filters
        if (bigLuggageStr !== null) {
            const big = Number(bigLuggageStr);
            if (Number.isFinite(big)) {
                whereConditions += ` AND tr.big_luggage_lim >= $${paramCounter}`;
                queryParams.push(Math.max(0, Math.floor(big)));
                paramCounter++;
            }
        }

        if (smallLuggageStr !== null) {
            const small = Number(smallLuggageStr);
            if (Number.isFinite(small)) {
                whereConditions += ` AND tr.small_luggage_lim >= $${paramCounter}`;
                queryParams.push(Math.max(0, Math.floor(small)));
                paramCounter++;
            }
        }

        if (priceMaxStr !== null) {
            const priceMax = Number(priceMaxStr);
            if (Number.isFinite(priceMax)) {
                whereConditions += ` AND t.price <= $${paramCounter}`;
                queryParams.push(priceMax);
                paramCounter++;
            }
        }

        if (autoAcceptStr === 'true') {
            whereConditions += ` AND tr.auto_accept = true`;
        }

        if (paymentMethodsStr) {
            // Semantics: "trip accepts ANY of these"
            const methods = paymentMethodsStr
                .split(',')
                .map(s => s.trim())
                .filter(Boolean);

            if (methods.length > 0) {
                whereConditions += ` AND tr.payment_methods && $${paramCounter}`;
                queryParams.push(methods);
                paramCounter++;
            }
        }

        // If you want to enforce "bookable" only when seats available:
        // - keep full trips in results, but make sure "bookable" implies seats available
        // This prevents stale states from letting users see "bookable" trips with 0 seats.
        whereConditions += `
      AND NOT (t.status = 'bookable' AND t.seats_taken >= t.total_seats)
    `;

        // Ranking:
        // - After the date filter, "closest to requested time" is reasonable
        const query = `
            WITH candidates AS (
            SELECT
                t.id,
                t.from_text,
                t.to_text,
                t.departure_time,
                t.price,
                t.total_seats,
                t.seats_taken,
                t.status,

                tr.big_luggage_lim,
                tr.small_luggage_lim,
                tr.auto_accept,
                tr.payment_methods,
                tr.departure_time_flexibility::text,

                pg.name AS driver_name,
                pg.photo_url AS driver_photo_url,
                pd.rating_cached AS driver_rating,
                pd.completed_trips AS driver_completed_trips,

                ABS(EXTRACT(EPOCH FROM (t.departure_time - $5))) / 60
                AS time_diff_minutes,

                ST_Distance(
                t.origin_geog,
                ST_SetSRID(ST_MakePoint($1, $2), 4326)
                ) AS pickup_distance_m,

                ST_Distance(
                t.destination_geog,
                ST_SetSRID(ST_MakePoint($3, $4), 4326)
                ) AS dropoff_distance_m

            FROM trips t
            JOIN trip_rules tr ON t.id = tr.id
            LEFT JOIN profile_global pg ON t.driver = pg.id
            LEFT JOIN profile_driver pd ON t.driver = pd.id
            WHERE ${whereConditions}
            )

            SELECT *,
            (
                time_diff_minutes
                + LEAST(pickup_distance_m, 3000) / 400
                + LEAST(dropoff_distance_m, 8000) / 1500
            ) AS score
            FROM candidates
            ORDER BY score ASC
            LIMIT $6 OFFSET $7;

    `;

        const result = await client.query(query, queryParams);

        return NextResponse.json({ rides: result.rows, page, limit });
    } catch (error) {
        console.error('Search error', error);
        return NextResponse.json({ rides: [] }, { status: 500 });
    } finally {
        client.release();
    }
}
