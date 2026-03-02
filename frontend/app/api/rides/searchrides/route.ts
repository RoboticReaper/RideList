import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/app/api/lib/db';
import { redactName } from '@/app/api/lib/redactName';
import dayjs, { CHICAGO_TZ } from '@/utils/dateUtils';

// NOTE: Public endpoint (no auth). Do NOT include sensitive fields here (phone, payment_handle, plates, etc.)
export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;

    const startLatStr = searchParams.get('start_lat');
    const startLngStr = searchParams.get('start_lng');
    const endLatStr = searchParams.get('end_lat');
    const endLngStr = searchParams.get('end_lng');
    const dateStr = searchParams.get('date');

    const startLat = startLatStr ? Number(startLatStr) : null;
    const startLng = startLngStr ? Number(startLngStr) : null;
    const endLat = endLatStr ? Number(endLatStr) : null;
    const endLng = endLngStr ? Number(endLngStr) : null;

    // Check for start/end location presence independently
    const hasStart = startLat !== null && Number.isFinite(startLat) && startLng !== null && Number.isFinite(startLng);
    const hasEnd = endLat !== null && Number.isFinite(endLat) && endLng !== null && Number.isFinite(endLng);

    // Validate date if provided
    let reqDate: Date | null = null;
    if (dateStr) {
        // Parse input date (YYYY-MM-DD) as Chicago Midnight
        const d = dayjs.tz(dateStr, CHICAGO_TZ);
        if (d.isValid()) {
            reqDate = d.toDate();
        }
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
        const queryParams: (string | number | Date | string[] | null | undefined)[] = [];
        let paramCounter = 1;

        // Base condition: always show only future trips (from NOW)
        // status must be bookable or full
        let whereConditions = `
            t.status IN ('bookable', 'full')
            AND t.departure_time >= NOW()
        `;

        // Date Filter Logic
        let dateParamIdx: number | null = null;
        if (reqDate) {
            whereConditions += `
                AND t.departure_time >= ($${paramCounter}::timestamptz - interval '3 days')
                AND t.departure_time <= ($${paramCounter}::timestamptz + interval '3 days')
            `;
            queryParams.push(reqDate);
            dateParamIdx = paramCounter;
            paramCounter++;
        }

        // Start Location Logic
        let startLocIdx: number | null = null;
        if (hasStart) {
            whereConditions += `
                AND ST_DWithin(t.origin_geog, ST_SetSRID(ST_MakePoint($${paramCounter}, $${paramCounter + 1}), 4326), tr.pickup_radius_meters)
            `;
            queryParams.push(startLng, startLat);
            startLocIdx = paramCounter;
            paramCounter += 2;
        }

        // End Location Logic
        let endLocIdx: number | null = null;
        if (hasEnd) {
            whereConditions += `
                AND ST_DWithin(t.destination_geog, ST_SetSRID(ST_MakePoint($${paramCounter}, $${paramCounter + 1}), 4326), tr.drop_off_radius_meters)
            `;
            queryParams.push(endLng, endLat);
            endLocIdx = paramCounter;
            paramCounter += 2;
        }

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

        // Fix stale bookable records
        whereConditions += `
            AND NOT (t.status = 'bookable' AND t.seats_taken >= t.total_seats)
        `;

        // Ranking / Scoring
        const timeDiffExpr = dateParamIdx
            ? `ABS(EXTRACT(EPOCH FROM (t.departure_time - $${dateParamIdx}::timestamptz)))`
            : `ABS(EXTRACT(EPOCH FROM (t.departure_time - NOW())))`;

        const startDistExpr = startLocIdx
            ? `LEAST(ST_Distance(t.origin_geog, ST_SetSRID(ST_MakePoint($${startLocIdx}, $${startLocIdx + 1}), 4326)), 3000) / 400`
            : `0`;

        const endDistExpr = endLocIdx
            ? `LEAST(ST_Distance(t.destination_geog, ST_SetSRID(ST_MakePoint($${endLocIdx}, $${endLocIdx + 1}), 4326)), 8000) / 1500`
            : `0`;

        const scoreCalculation = `
            ${timeDiffExpr} / 60
            + ${startDistExpr}
            + ${endDistExpr}
        `;
        const orderBy = 'score ASC';

        // Add limit/offset to params
        queryParams.push(limit, offset);
        const limitIdx = paramCounter;
        const offsetIdx = paramCounter + 1;

        const query = `
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
                tr.big_luggage_paid,
                tr.small_luggage_paid,
                tr.big_luggage_paid_price,
                tr.small_luggage_paid_price,
                tr.auto_accept,
                tr.payment_methods,
                tr.departure_time_flexibility::text,

                pg.name AS driver_name,
                pg.verified AS driver_verified,
                pg.community_driver AS driver_community_driver,
                pg.photo_url AS driver_photo_url,
                pd.rating_cached AS driver_rating,
                pd.completed_trips AS driver_completed_trips,
                (${scoreCalculation}) AS score

            FROM trips t
            JOIN trip_rules tr ON t.id = tr.id
            LEFT JOIN profile_global pg ON t.driver = pg.id
            LEFT JOIN profile_driver pd ON t.driver = pd.id
            WHERE ${whereConditions}
            ORDER BY ${orderBy}
            LIMIT $${limitIdx} OFFSET $${offsetIdx}
        `;


        const result = await client.query(query, queryParams);

        // Post-processing: Redact names
        const rows = result.rows.map(row => ({
            ...row,
            driver_name: redactName(row.driver_name),
            driver_photo_url: row.driver_photo_url || null
        }));

        return NextResponse.json({ rides: rows, page, limit });
    } catch (error) {
        console.error('Search error', error);
        return NextResponse.json({ rides: [] }, { status: 500 });
    } finally {
        client.release();
    }
}
