
import { NextResponse } from 'next/server';
import { pool } from '@/app/api/lib/db';
import { verifyUserFromRequest } from '@/app/api/lib/verifyUser';
import { getTranslationForUser } from '@/app/api/lib/i18n';
import { processPaymentQRCode } from '@/app/api/lib/processQRCode';

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
            `SELECT * FROM rule_templates WHERE driver = $1 ORDER BY name ASC`,
            [user.uid]
        );
        return NextResponse.json({ templates: templatesRes.rows });

    } catch (error: any) {
        console.error("Fetch Rule Templates API Error:", error);
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
            start_check_in_hrs_before_departure,
            payment_qr_codes
        } = body;

        if (!name) {
            if (!name) {
                return NextResponse.json({ error: t('api.errors.templateNameRequired') }, { status: 400 });
            }
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

        const insertRes = await client.query(
            `INSERT INTO rule_templates (
                driver, name, big_luggage_lim, small_luggage_lim, pickup_rules,
                pickup_radius_meters, drop_off_radius_meters, departure_time_flexibility,
                payment_methods, cancellation_policy, auto_accept, cutoff_time, payment_handle,
                    pay_window,
                    start_check_in_hrs_before_departure,
                    payment_qr_codes
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
                    $14, $15, $16
                ) RETURNING *`,
            [
                user.uid, name, big_luggage_lim, small_luggage_lim, pickup_rules,
                pickup_radius_meters, drop_off_radius_meters, departure_time_flexibility,
                payment_methods, cancellation_policy, auto_accept, cutoff_time, payment_handle,
                pay_window, start_check_in_hrs_before_departure, processedQRCodes
            ]
        );

        return NextResponse.json({ template: insertRes.rows[0] });

    } catch (error: any) {
        console.error("Create Rule Template API Error:", error);
        const t = await getTranslationForUser(null, client);
        return NextResponse.json({ error: error.message || t('api.errors.internalError') }, { status: 500 });
    } finally {
        client.release();
    }
}
