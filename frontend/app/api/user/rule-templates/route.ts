
import { NextResponse } from 'next/server';
import { pool } from '@/app/api/lib/db';
import { verifyUserFromRequest } from '@/app/api/lib/verifyUser';

export async function GET(req: Request) {
    const client = await pool.connect();

    try {
        const user = await verifyUserFromRequest(
            req.headers.get('authorization') ?? undefined
        );

        if (!user || !user.uid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const templatesRes = await client.query(
            `SELECT * FROM rule_templates WHERE driver = $1 ORDER BY name ASC`,
            [user.uid]
        );
        return NextResponse.json({ templates: templatesRes.rows });

    } catch (error: any) {
        console.error("Fetch Rule Templates API Error:", error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
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
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

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

        if (!name) {
            return NextResponse.json({ error: 'Template name is required' }, { status: 400 });
        }

        const insertRes = await client.query(
            `INSERT INTO rule_templates (
                driver, name, big_luggage_lim, small_luggage_lim, pickup_rules,
                pickup_radius_meters, drop_off_radius_meters, departure_time_flexibility,
                payment_methods, cancellation_policy, auto_accept, cutoff_time, payment_handle,
                    pay_window,
                    start_check_in_hrs_before_departure
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
                    $14, $15
                ) RETURNING *`,
            [
                user.uid, name, big_luggage_lim, small_luggage_lim, pickup_rules,
                pickup_radius_meters, drop_off_radius_meters, departure_time_flexibility,
                payment_methods, cancellation_policy, auto_accept, cutoff_time, payment_handle,
                pay_window, start_check_in_hrs_before_departure
            ]
        );

        return NextResponse.json({ template: insertRes.rows[0] });

    } catch (error: any) {
        console.error("Create Rule Template API Error:", error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    } finally {
        client.release();
    }
}
