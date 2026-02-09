import { NextResponse } from 'next/server';
import { pool } from '@/app/api/lib/db';
import { verifyUserFromRequest } from '@/app/api/lib/verifyUser';
import { getTranslationForUser } from '@/app/api/lib/i18n';

// Grid size in degrees (approximately 1km at equator)
const GRID_SIZE = 0.01;

export async function GET(req: Request) {
    const client = await pool.connect();

    try {
        // Auth Check
        const user = await verifyUserFromRequest(
            req.headers.get('authorization') ?? undefined
        );

        if (!user || !user.uid) {
            const t = await getTranslationForUser(null, client);
            return NextResponse.json({ error: t('api.errors.unauthorized') }, { status: 401 });
        }

        // Query for clustered ride request trends
        // Groups by: origin grid, destination grid, date, and time period
        // This ensures same time on different days shows as different trends
        const result = await client.query(`
            WITH grid_requests AS (
                SELECT 
                    -- Use pre-computed generated columns for better performance
                    origin_grid,
                    dest_grid,
                    requester_id,
                    from_text,
                    to_text,
                    seats,
                    price,
                    preferred_time,
                    -- Extract date in Chicago timezone
                    (preferred_time AT TIME ZONE 'America/Chicago')::date as preferred_date,
                    -- Categorize time of day (in Chicago timezone)
                    CASE 
                        WHEN EXTRACT(HOUR FROM preferred_time AT TIME ZONE 'America/Chicago') >= 6 
                             AND EXTRACT(HOUR FROM preferred_time AT TIME ZONE 'America/Chicago') < 12 
                        THEN 'morning'
                        WHEN EXTRACT(HOUR FROM preferred_time AT TIME ZONE 'America/Chicago') >= 12 
                             AND EXTRACT(HOUR FROM preferred_time AT TIME ZONE 'America/Chicago') < 18 
                        THEN 'afternoon'
                        WHEN EXTRACT(HOUR FROM preferred_time AT TIME ZONE 'America/Chicago') >= 18 
                             AND EXTRACT(HOUR FROM preferred_time AT TIME ZONE 'America/Chicago') < 24 
                        THEN 'evening'
                        ELSE 'night'
                    END as time_category
                FROM ride_requests
                WHERE status = 'active'
                  AND expires_at > NOW()
            ),
            -- Find most common from_text per cluster+date+time using DISTINCT ON
            from_text_counts AS (
                SELECT 
                    origin_grid,
                    dest_grid,
                    preferred_date,
                    time_category,
                    from_text,
                    COUNT(*) as text_count
                FROM grid_requests
                GROUP BY origin_grid, dest_grid, preferred_date, time_category, from_text
            ),
            top_from_text AS (
                SELECT DISTINCT ON (origin_grid, dest_grid, preferred_date, time_category)
                    origin_grid,
                    dest_grid,
                    preferred_date,
                    time_category,
                    from_text
                FROM from_text_counts
                ORDER BY origin_grid, dest_grid, preferred_date, time_category, text_count DESC
            ),
            -- Find most common to_text per cluster+date+time using DISTINCT ON
            to_text_counts AS (
                SELECT 
                    origin_grid,
                    dest_grid,
                    preferred_date,
                    time_category,
                    to_text,
                    COUNT(*) as text_count
                FROM grid_requests
                GROUP BY origin_grid, dest_grid, preferred_date, time_category, to_text
            ),
            top_to_text AS (
                SELECT DISTINCT ON (origin_grid, dest_grid, preferred_date, time_category)
                    origin_grid,
                    dest_grid,
                    preferred_date,
                    time_category,
                    to_text
                FROM to_text_counts
                ORDER BY origin_grid, dest_grid, preferred_date, time_category, text_count DESC
            ),
            -- Main cluster aggregation - now grouped by date and time_category as well
            clusters AS (
                SELECT 
                    gr.origin_grid,
                    gr.dest_grid,
                    gr.preferred_date,
                    gr.time_category,
                    SUM(gr.seats) as total_seats_demanded,
                    COUNT(*) as request_count,
                    -- Confidence score: balances demand volume with request diversity
                    (COUNT(DISTINCT gr.requester_id)::double precision
                        * LN((SUM(gr.seats))::double precision + 1.0)
                        ) AS confidence_score,
                    -- Price percentiles (5th to 95th for middle 90%), filter out NULLs
                    PERCENTILE_CONT(0.05) WITHIN GROUP (ORDER BY gr.price) 
                        FILTER (WHERE gr.price IS NOT NULL) as price_p5,
                    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY gr.price) 
                        FILTER (WHERE gr.price IS NOT NULL) as price_p95,
                    AVG(gr.price) FILTER (WHERE gr.price IS NOT NULL) as avg_price
                FROM grid_requests gr
                GROUP BY gr.origin_grid, gr.dest_grid, gr.preferred_date, gr.time_category
            )
            SELECT 
                ST_Y(c.origin_grid) as origin_lat,
                ST_X(c.origin_grid) as origin_lng,
                ST_Y(c.dest_grid) as dest_lat,
                ST_X(c.dest_grid) as dest_lng,
                c.preferred_date,
                c.time_category,
                c.total_seats_demanded,
                c.request_count,
                ROUND(c.confidence_score::numeric, 2) as confidence_score,
                ROUND(c.price_p5::numeric, 2) as price_min,
                ROUND(c.price_p95::numeric, 2) as price_max,
                ROUND(c.avg_price::numeric, 2) as price_avg,
                tft.from_text as top_from_text,
                ttt.to_text as top_to_text
            FROM clusters c
            LEFT JOIN top_from_text tft 
                ON c.origin_grid = tft.origin_grid 
                AND c.dest_grid = tft.dest_grid
                AND c.preferred_date = tft.preferred_date
                AND c.time_category = tft.time_category
            LEFT JOIN top_to_text ttt 
                ON c.origin_grid = ttt.origin_grid 
                AND c.dest_grid = ttt.dest_grid
                AND c.preferred_date = ttt.preferred_date
                AND c.time_category = ttt.time_category
            ORDER BY c.preferred_date ASC, c.confidence_score DESC
            LIMIT 20
        `);

        // Transform results into a cleaner format
        let trends = result.rows.map(row => ({
            cluster: {
                originCenter: {
                    lat: parseFloat(row.origin_lat) + GRID_SIZE / 2,
                    lng: parseFloat(row.origin_lng) + GRID_SIZE / 2
                },
                destinationCenter: {
                    lat: parseFloat(row.dest_lat) + GRID_SIZE / 2,
                    lng: parseFloat(row.dest_lng) + GRID_SIZE / 2
                }
            },
            fromText: row.top_from_text,
            toText: row.top_to_text,
            date: row.preferred_date,
            timeCategory: row.time_category,
            demand: {
                totalSeats: parseInt(row.total_seats_demanded),
                requestCount: parseInt(row.request_count),
                confidenceScore: row.confidence_score ? parseFloat(row.confidence_score) : 0
            },
            priceRange: {
                min: row.price_min ? parseFloat(row.price_min) : null,
                max: row.price_max ? parseFloat(row.price_max) : null,
                avg: row.price_avg ? parseFloat(row.price_avg) : null
            }
        }));

        trends.sort((a, b) =>
            b.demand.confidenceScore - a.demand.confidenceScore
        );

        const total = trends.length;

        const enoughData = total >= 5;

        const trendsWithLevels = trends.map((t, index) => {

            const percentile = total > 1 ? index / (total - 1) : 0;

            let demandLevel: 'low' | 'medium' | 'high' = 'low';

            const seats = t.demand.totalSeats;
            const requests = t.demand.requestCount;

            if (
                enoughData &&
                percentile <= 0.2 &&
                requests >= 3 &&
                seats >= 8
            ) {
                demandLevel = 'high';
            }
            else if (percentile <= 0.6 || (seats >= 4 && percentile <= 0.8)) {
                demandLevel = 'medium';
            }

            return {
                ...t,
                demand: {
                    ...t.demand,
                    demandLevel
                }
            };
        });



        return NextResponse.json({
            success: true,
            trends: trendsWithLevels,
            gridSizeKm: GRID_SIZE * 111 // Approximate km (1 degree ≈ 111km)
        });

    } catch (error: any) {
        console.error("Get Ride Request Trends API Error:", error);
        const t = await getTranslationForUser(null, client);
        return NextResponse.json({ error: error.message || t('api.errors.internalError') }, { status: 500 });
    } finally {
        client.release();
    }
}
