
import { NextResponse } from 'next/server';
import { pool } from '@/app/api/lib/db';
import { verifyUserFromRequest } from '@/app/api/lib/verifyUser';
import { getTranslationForUser } from '@/app/api/lib/i18n';
import { processPaymentQRCode } from '@/app/api/lib/processQRCode';

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
            big_luggage_paid,
            small_luggage_paid,
            big_luggage_paid_price,
            small_luggage_paid_price,
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
            start_check_in_hrs_before_departure,
            payment_qr_codes
        } = body;

        // Validate paid luggage: price must be > 0 if count > 0
        if ((big_luggage_paid || 0) > 0 && !(big_luggage_paid_price > 0)) {
            return NextResponse.json({ error: 'Paid big luggage price must be greater than 0 when paid big luggage count is set.' }, { status: 400 });
        }
        if ((small_luggage_paid || 0) > 0 && !(small_luggage_paid_price > 0)) {
            return NextResponse.json({ error: 'Paid small luggage price must be greater than 0 when paid small luggage count is set.' }, { status: 400 });
        }

        // Process QR codes
        const processedQRCodes: Record<string, string> = {};
        if (payment_qr_codes && payment_methods) {
            for (const method of payment_methods) {
                const qrData = payment_qr_codes[method];
                if (qrData && typeof qrData === 'string') {
                    if (qrData.startsWith('data:')) {
                        const url = await processPaymentQRCode(qrData, user.uid, t);
                        processedQRCodes[method] = url;
                    } else if (qrData.startsWith('https://')) {
                        processedQRCodes[method] = qrData;
                    }
                }
            }
        }

        const res = await client.query(
            `UPDATE rule_templates SET
                name = COALESCE($1, name),
                big_luggage_lim = $2,
                small_luggage_lim = $3,
                big_luggage_paid = $4,
                small_luggage_paid = $5,
                big_luggage_paid_price = $6,
                small_luggage_paid_price = $7,
                pickup_rules = $8,
                pickup_radius_meters = $9,
                drop_off_radius_meters = $10,
                departure_time_flexibility = $11,
                payment_methods = $12,
                cancellation_policy = $13,
                auto_accept = $14,
                cutoff_time = $15,
                payment_handle = $16,
                pay_window = $17,
                start_check_in_hrs_before_departure = $18,
                payment_qr_codes = $19
             WHERE id = $20 AND driver = $21
             RETURNING *`,
            [
                name, big_luggage_lim, small_luggage_lim,
                big_luggage_paid, small_luggage_paid,
                big_luggage_paid_price, small_luggage_paid_price,
                pickup_rules,
                pickup_radius_meters, drop_off_radius_meters, departure_time_flexibility,
                payment_methods, cancellation_policy, auto_accept, cutoff_time, payment_handle,
                pay_window, start_check_in_hrs_before_departure, processedQRCodes,
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
