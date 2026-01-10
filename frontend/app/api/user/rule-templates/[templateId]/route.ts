
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

        const res = await client.query('SELECT * FROM rule_templates WHERE id = $1 AND driver = $2', [templateId, user.uid]);

        if (res.rowCount === 0) return NextResponse.json({ error: t('api.errors.notFound') }, { status: 404 });
        return NextResponse.json({ template: res.rows[0] });
    } catch (error: any) {
        console.error("Get Rule Template API Error:", error);
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
            big_luggage_lim,
            small_luggage_lim,
            pickup_rules,
            pickup_radius_meters,
            drop_off_radius_meters,
            departure_time_flexibility,
            payment_methods,
            cancellation_policy,
            auto_accept,
            cutoff_time,
            payment_handle,
            pay_window,
            start_check_in_hrs_before_departure
        } = body;

        const res = await client.query(
            `UPDATE rule_templates SET
                name = COALESCE($1, name),
                big_luggage_lim = $2,
                small_luggage_lim = $3,
                pickup_rules = $4,
                pickup_radius_meters = $5,
                drop_off_radius_meters = $6,
                departure_time_flexibility = $7,
                payment_methods = $8,
                cancellation_policy = $9,
                auto_accept = $10,
                cutoff_time = $11,
                payment_handle = $12,
                pay_window = $13,
                start_check_in_hrs_before_departure = $14
             WHERE id = $15 AND driver = $16
             RETURNING *`,
            [
                name, big_luggage_lim, small_luggage_lim, pickup_rules,
                pickup_radius_meters, drop_off_radius_meters, departure_time_flexibility,
                payment_methods, cancellation_policy, auto_accept, cutoff_time, payment_handle,
                pay_window, start_check_in_hrs_before_departure,
                templateId, user.uid
            ]
        );

        if (res.rowCount === 0) return NextResponse.json({ error: t('api.errors.notFoundOrUnauthorized') }, { status: 404 });
        return NextResponse.json({ template: res.rows[0] });

    } catch (error: any) {
        console.error("Update Rule Template API Error:", error);
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

        const check = await client.query('SELECT 1 FROM trip_templates WHERE rule = $1 LIMIT 1', [templateId]);
        if (check.rowCount && check.rowCount > 0) {
            return NextResponse.json({ error: t('api.errors.ruleTemplateLinkedToTrip') }, { status: 409 });
        }

        const res = await client.query('DELETE FROM rule_templates WHERE id = $1 AND driver = $2 RETURNING id', [templateId, user.uid]);
        if (res.rowCount === 0) return NextResponse.json({ error: t('api.errors.notFoundOrUnauthorized') }, { status: 404 });
        return NextResponse.json({ success: true, id: templateId });
    } catch (error: any) {
        console.error("Delete Rule Template API Error:", error);
        const t = await getTranslationForUser(null, client);
        return NextResponse.json({ error: error.message || t('api.errors.internalError') }, { status: 500 });
    } finally { client.release(); }
}
