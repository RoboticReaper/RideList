
import { NextResponse } from 'next/server';
import { pool } from '@/app/api/lib/db';
import { verifyUserFromRequest } from '@/app/api/lib/verifyUser';

export async function POST(req: Request) {
    try {
        const user = await verifyUserFromRequest(
            req.headers.get('authorization') ?? undefined
        );

        const { deviceId, token } = await req.json();

        if (!deviceId || !token) {
            return NextResponse.json({ error: 'Missing deviceId or token' }, { status: 400 });
        }

        // Register token logic:
        // 1. Takeover: If this token exists for ANY other user, delete it.
        //    This happens when User A logs out and User B logs in on the same browser/device.
        //    Privacy violation if we don't do this.
        await pool.query(`
            DELETE FROM user_devices 
            WHERE fcm_token = $1 AND user_id != $2
        `, [token, user.uid]);

        // 2. Upsert:
        // - Must match user_id + device_id
        // - Update fcm_token
        // - Set permission_state = 'granted'
        // - Set push_enabled = true
        // - Update token_last_updated_at
        // - Clear invalidated_at (in case it was previously invalid)

        const query = `
            INSERT INTO user_devices (user_id, device_id, fcm_token, platform, permission_state, push_enabled, token_last_updated_at, last_seen_at)
            VALUES ($1, $2, $3, 'web', 'granted', true, NOW(), NOW())
            ON CONFLICT (user_id, device_id)
            DO UPDATE SET 
                fcm_token = $3,
                permission_state = 'granted',
                push_enabled = true,
                token_last_updated_at = NOW(),
                invalidated_at = NULL,
                last_seen_at = NOW()
            WHERE user_devices.fcm_token IS DISTINCT FROM $3
            RETURNING id
        `;

        const result = await pool.query(query, [user.uid, deviceId, token]);

        // if result.rowCount === 0, it means it was a no-op (token identical), which is fine.


        return NextResponse.json({ success: true });

    } catch (error) {
        console.error("Register token error:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
