
import { NextResponse } from 'next/server';
import { pool } from '@/app/api/lib/db';
import { verifyUserFromRequest } from '@/app/api/lib/verifyUser';
import { getTranslationForUser } from '@/app/api/lib/i18n';

export async function GET(req: Request) {
    const client = await pool.connect();

    try {
        const user = await verifyUserFromRequest(
            req.headers.get('authorization') ?? undefined
        );

        if (!user || !user.uid) {
            const t = await getTranslationForUser(null, client);
            return NextResponse.json({ error: t('api.errors.unauthorized') }, { status: 401 });
        }

        const templatesRes = await client.query(
            `SELECT 
                t.*,
                ST_Y(t.origin_geog::geometry) as origin_lat,
                ST_X(t.origin_geog::geometry) as origin_lng,
                ST_Y(t.destination_geog::geometry) as dest_lat,
                ST_X(t.destination_geog::geometry) as dest_lng,
                row_to_json(r) as rule_details,
                row_to_json(c) as car_details
             FROM trip_templates t
             LEFT JOIN rule_templates r ON t.rule = r.id
             LEFT JOIN cars c ON t.car = c.id
             WHERE t.driver = $1 
             ORDER BY t.created_at DESC`,
            [user.uid]
        );


        return NextResponse.json({ templates: templatesRes.rows });

    } catch (error: any) {
        console.error("Fetch Trip Templates API Error:", error);
        const t = await getTranslationForUser(null, client);
        return NextResponse.json({ error: error.message || t('api.errors.internalError') }, { status: 500 });
    } finally {
        client.release();
    }
}

export async function POST(req: Request) {
    const client = await pool.connect();

    try {
        const user = await verifyUserFromRequest(
            req.headers.get('authorization') ?? undefined
        );

        if (!user || !user.uid) {
            const t = await getTranslationForUser(null, client);
            return NextResponse.json({ error: t('api.errors.unauthorized') }, { status: 401 });
        }

        const t = await getTranslationForUser(user.uid, client);

        const body = await req.json();
        const {
            name,
            notes,
            price,
            total_seats,
            from_text,
            to_text,
            from_place_id,
            to_place_id,
            origin_lat,
            origin_lng,
            dest_lat,
            dest_lng,
            car_id,
            rule_id,
            trip_title
        } = body;

        if (!name) {
            return NextResponse.json({ error: t('api.errors.templateNameRequired') }, { status: 400 });
        }

        // Extended Validation: Check Capacity
        if (car_id) {
            const carRes = await client.query(
                `SELECT seats, big_luggage, small_luggage FROM cars WHERE id = $1 AND owner = $2`,
                [car_id, user.uid]
            );

            if ((carRes.rowCount || 0) > 0) {
                const car = carRes.rows[0];

                // 1. Check Seats
                if (total_seats && total_seats > car.seats) {
                    return NextResponse.json({
                        error: t('api.errors.templateSeatsExceedCarCapacity', { seats: total_seats, capacity: car.seats })
                    }, { status: 400 });
                }

                // 2. Check Luggage (if rule linked)
                if (rule_id) {
                    const ruleRes = await client.query(
                        `SELECT big_luggage_lim, small_luggage_lim FROM rule_templates WHERE id = $1 AND driver = $2`,
                        [rule_id, user.uid]
                    );
                    if ((ruleRes.rowCount || 0) > 0) {
                        const rule = ruleRes.rows[0];
                        if (car.big_luggage !== null && (rule.big_luggage_lim || 0) > car.big_luggage) {
                            return NextResponse.json({
                                error: t('api.errors.ruleBigLuggageExceedsCar', { limit: rule.big_luggage_lim, capacity: car.big_luggage })
                            }, { status: 400 });
                        }
                        if (car.small_luggage !== null && (rule.small_luggage_lim || 0) > car.small_luggage) {
                            return NextResponse.json({
                                error: t('api.errors.ruleSmallLuggageExceedsCar', { limit: rule.small_luggage_lim, capacity: car.small_luggage })
                            }, { status: 400 });
                        }
                    }
                }
            }
        }

        const insertRes = await client.query(
            `INSERT INTO trip_templates (
                driver, name, notes, price, total_seats, from_text, to_text,
                from_place_id, to_place_id,
                origin_geog, destination_geog, car, rule,
                trip_title
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7,
                $14, $15,
                ST_SetSRID(ST_MakePoint($8, $9), 4326),
                ST_SetSRID(ST_MakePoint($10, $11), 4326),
                $12, $13,
                $16
            ) RETURNING *`,
            [
                user.uid, name, notes, price, total_seats, from_text, to_text,
                origin_lng || null, origin_lat || null,
                dest_lng || null, dest_lat || null,
                car_id || null, rule_id || null,
                from_place_id || null, to_place_id || null,
                trip_title || null
            ]
        );

        return NextResponse.json({ template: insertRes.rows[0] });

    } catch (error: any) {
        console.error("Create Trip Template API Error:", error);
        const t = await getTranslationForUser(null, client);
        return NextResponse.json({ error: error.message || t('api.errors.internalError') }, { status: 500 });
    } finally {
        client.release();
    }
}
