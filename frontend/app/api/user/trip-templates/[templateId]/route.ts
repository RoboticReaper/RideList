
import { NextResponse } from 'next/server';
import { pool } from '@/app/api/lib/db';
import { verifyUserFromRequest } from '@/app/api/lib/verifyUser';
import { getTranslationForUser } from '@/app/api/lib/i18n';

export async function GET(
    req: Request,
    { params }: { params: Promise<{ templateId: string }> }
) {
    const { templateId } = await params;
    const client = await pool.connect();
    try {
        const user = await verifyUserFromRequest(req.headers.get('authorization') ?? undefined);
        if (!user || !user.uid) {
            const t = await getTranslationForUser(null, client);
            return NextResponse.json({ error: t('api.errors.unauthorized') }, { status: 401 });
        }

        const t = await getTranslationForUser(user.uid, client);

        const res = await client.query(`
            SELECT 
                t.*,
                ST_Y(t.origin_geog::geometry) as origin_lat,
                ST_X(t.origin_geog::geometry) as origin_lng,
                ST_Y(t.destination_geog::geometry) as dest_lat,
                ST_X(t.destination_geog::geometry) as dest_lng
            FROM trip_templates t
            WHERE t.id = $1 AND t.driver = $2
        `, [templateId, user.uid]);

        if (res.rowCount === 0) return NextResponse.json({ error: t('api.errors.notFound') }, { status: 404 });
        return NextResponse.json({ template: res.rows[0] });
    } catch (error: any) {
        console.error("Get Trip Template API Error:", error);
        const t = await getTranslationForUser(null, client);
        return NextResponse.json({ error: error.message || t('api.errors.internalError') }, { status: 500 });
    } finally { client.release(); }
}

export async function PUT(
    req: Request,
    { params }: { params: Promise<{ templateId: string }> }
) {
    const { templateId } = await params;
    const client = await pool.connect();
    try {
        const user = await verifyUserFromRequest(req.headers.get('authorization') ?? undefined);
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

        const res = await client.query(
            `UPDATE trip_templates SET
                name = COALESCE($1, name),
                notes = COALESCE($2, notes),
                price = COALESCE($3, price),
                total_seats = COALESCE($4, total_seats),
                from_text = COALESCE($5, from_text),
                to_text = COALESCE($6, to_text),
                from_place_id = COALESCE($15, from_place_id),
                to_place_id = COALESCE($16, to_place_id),
                origin_geog = CASE WHEN $7::float IS NOT NULL AND $8::float IS NOT NULL THEN ST_SetSRID(ST_MakePoint($8, $7), 4326) ELSE origin_geog END,
                destination_geog = CASE WHEN $9::float IS NOT NULL AND $10::float IS NOT NULL THEN ST_SetSRID(ST_MakePoint($10, $9), 4326) ELSE destination_geog END,
                car = $11,
                rule = $12,
                trip_title = COALESCE($17, trip_title)
             WHERE id = $13 AND driver = $14
             RETURNING *`,
            [
                name, notes, price, total_seats, from_text, to_text,
                origin_lat, origin_lng,
                dest_lat, dest_lng,
                car_id, rule_id,
                templateId, user.uid,
                from_place_id, to_place_id,
                trip_title
            ]
        );

        if (res.rowCount === 0) return NextResponse.json({ error: t('api.errors.notFoundOrUnauthorized') }, { status: 404 });
        return NextResponse.json({ template: res.rows[0] });

    } catch (error: any) {
        console.error("Update Trip Template API Error:", error);
        const t = await getTranslationForUser(null, client);
        return NextResponse.json({ error: error.message || t('api.errors.internalError') }, { status: 500 });
    } finally { client.release(); }
}

export async function DELETE(
    req: Request,
    { params }: { params: Promise<{ templateId: string }> }
) {
    const { templateId } = await params;
    const client = await pool.connect();
    try {
        const user = await verifyUserFromRequest(req.headers.get('authorization') ?? undefined);
        if (!user || !user.uid) {
            const t = await getTranslationForUser(null, client);
            return NextResponse.json({ error: t('api.errors.unauthorized') }, { status: 401 });
        }

        const t = await getTranslationForUser(user.uid, client);

        const res = await client.query('DELETE FROM trip_templates WHERE id = $1 AND driver = $2 RETURNING id', [templateId, user.uid]);
        if (res.rowCount === 0) return NextResponse.json({ error: t('api.errors.notFoundOrUnauthorized') }, { status: 404 });
        return NextResponse.json({ success: true, id: templateId });
    } catch (error: any) {
        console.error("Delete Trip Template API Error:", error);
        const t = await getTranslationForUser(null, client);
        return NextResponse.json({ error: error.message || t('api.errors.internalError') }, { status: 500 });
    } finally { client.release(); }
}
