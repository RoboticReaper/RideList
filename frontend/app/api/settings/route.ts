
import { NextResponse } from 'next/server';
import { pool } from '@/app/api/lib/db';
import { verifyUserFromRequest } from '@/app/api/lib/verifyUser';

export async function GET(req: Request) {
    try {
        const user = await verifyUserFromRequest(
            req.headers.get('authorization') ?? undefined
        );

        const { searchParams } = new URL(req.url);
        const role = searchParams.get('role');

        if (!role || (role !== 'driver' && role !== 'rider')) {
            return NextResponse.json({ error: 'Invalid or missing role parameter' }, { status: 400 });
        }

        let query = '';
        if (role === 'driver') {
            query = 'SELECT notifications FROM settings_driver WHERE id = $1';
        } else {
            query = 'SELECT notifications FROM settings_rider WHERE id = $1';
        }

        const res = await pool.query(query, [user.uid]);
        const notifications = res.rows[0]?.notifications || {};

        return NextResponse.json({ notifications });

    } catch (error) {
        console.error("Get Settings Error:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function PATCH(req: Request) {
    const client = await pool.connect();
    try {
        const user = await verifyUserFromRequest(
            req.headers.get('authorization') ?? undefined
        );

        const body = await req.json();
        const { role, notifications } = body;

        if (!role || (role !== 'driver' && role !== 'rider')) {
            return NextResponse.json({ error: 'Invalid or missing role' }, { status: 400 });
        }
        if (!notifications || typeof notifications !== 'object') {
            return NextResponse.json({ error: 'Invalid notifications object' }, { status: 400 });
        }

        let query = '';
        // Merge existing notifications with new ones using jsonb_concat or ||
        // If row doesn't exist, insert it.
        if (role === 'driver') {
            query = `
                INSERT INTO settings_driver (id, notifications)
                VALUES ($1, $2)
                ON CONFLICT (id) DO UPDATE 
                SET notifications = COALESCE(settings_driver.notifications, '{}'::jsonb) || $2
                RETURNING notifications
            `;
        } else {
            query = `
                INSERT INTO settings_rider (id, notifications)
                VALUES ($1, $2)
                ON CONFLICT (id) DO UPDATE 
                SET notifications = COALESCE(settings_rider.notifications, '{}'::jsonb) || $2
                RETURNING notifications
            `;
        }

        const res = await client.query(query, [user.uid, notifications]);

        return NextResponse.json({ notifications: res.rows[0].notifications });

    } catch (error) {
        console.error("Update Settings Error:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    } finally {
        client.release();
    }
}
