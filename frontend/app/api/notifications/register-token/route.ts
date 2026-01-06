
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
        // - Must match user_id + device_id
        // - Update fcm_token
        // - Set permission_state = 'granted'
        // - Set push_enabled = true
        // - Update token_last_updated_at
        // - Clear invalidated_at (in case it was previously invalid)

        const query = `
            UPDATE user_devices
            SET 
                fcm_token = $3,
                permission_state = 'granted',
                push_enabled = true,
                token_last_updated_at = NOW(),
                invalidated_at = NULL,
                last_seen_at = NOW()
            WHERE user_id = $1 AND device_id = $2
            RETURNING id
        `;

        const result = await pool.query(query, [user.uid, deviceId, token]);

        if (result.rowCount === 0) {
            // Device not found (maybe register-device wasn't called or failed silently?)
            // We could upsert here, but strictly following separation of concerns, 
            // register-device should have been called first. 
            // However, to be robust, if we possess a token, we imply the device exists. 
            // But let's stick to the rule: register-device is called on load.
            // If it returns 0, it means device_id not found for this user.
            return NextResponse.json({ error: 'Device not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error("Register token error:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
