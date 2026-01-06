
import { NextResponse } from 'next/server';
import { pool } from '@/app/api/lib/db';
import { verifyUserFromRequest } from '@/app/api/lib/verifyUser';

export async function POST(req: Request) {
    try {
        const user = await verifyUserFromRequest(
            req.headers.get('authorization') ?? undefined
        );

        const { deviceId, result } = await req.json();

        if (!deviceId || !result) {
            return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
        }

        if (!['accepted', 'denied', 'dismissed'].includes(result)) {
            return NextResponse.json({ error: 'Invalid result' }, { status: 400 });
        }

        // Logic:
        // - Fetch current permission_state
        // - If 'denied', REJECT update (safety check against accidental re-prompts)
        // - Else update last_prompted_at, last_prompt_result
        // - If result is 'denied', also set permission_state = 'denied' (syncing client state)

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const checkQuery = `
                SELECT permission_state FROM user_devices
                WHERE user_id = $1 AND device_id = $2
            `;
            const checkRes = await client.query(checkQuery, [user.uid, deviceId]);

            if (checkRes.rows.length === 0) {
                await client.query('ROLLBACK');
                return NextResponse.json({ error: 'Device not found' }, { status: 404 });
            }

            const currentPermission = checkRes.rows[0].permission_state;

            if (currentPermission === 'denied') {
                // Should not happen if frontend logic is correct
                await client.query('ROLLBACK');
                return NextResponse.json({ error: 'Cannot prompt denied device' }, { status: 400 });
            }

            let updateQuery = `
                UPDATE user_devices
                SET 
                    last_prompted_at = NOW(),
                    last_prompt_result = $3
                WHERE user_id = $1 AND device_id = $2
            `;

            if (result === 'denied') {
                updateQuery = `
                    UPDATE user_devices
                    SET 
                        last_prompted_at = NOW(),
                        last_prompt_result = $3,
                        permission_state = 'denied',
                        push_enabled = false
                    WHERE user_id = $1 AND device_id = $2
                `;
            }

            await client.query(updateQuery, [user.uid, deviceId, result]);

            await client.query('COMMIT');
            return NextResponse.json({ success: true });

        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }

    } catch (error) {
        console.error("Prompt result error:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
