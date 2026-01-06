
import { NextResponse } from 'next/server';
import { pool } from '@/app/api/lib/db';
import { verifyUserFromRequest } from '@/app/api/lib/verifyUser';

export async function POST(req: Request) {
    try {
        const user = await verifyUserFromRequest(
            req.headers.get('authorization') ?? undefined
        );

        const { deviceId } = await req.json();

        if (!deviceId) {
            return NextResponse.json({ error: 'Missing deviceId' }, { status: 400 });
        }

        // Upsert device:
        // - Save user_id, device_id (unique constraint)
        // - Update last_seen_at
        // - DO NOT change permission_state
        // - DO NOT change push_enabled (unless it's a new row, default is false)
        const query = `
            INSERT INTO user_devices (user_id, device_id, platform, last_seen_at)
            VALUES ($1, $2, 'web', NOW())
            ON CONFLICT (user_id, device_id)
            DO UPDATE SET last_seen_at = NOW()
            RETURNING id
        `;

        await pool.query(query, [user.uid, deviceId]);

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error("Register device error:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
