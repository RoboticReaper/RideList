import { NextResponse } from 'next/server';
import { pool } from '@/app/api/lib/db';

// Security: Verify CRON_SECRET header
// should run once per week
const CRON_SECRET = process.env.CRON_SECRET;

export async function POST(req: Request) {
    if (req.method !== 'POST') {
        return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const authHeader = req.headers.get('x-cron-secret');
    if (authHeader !== CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Delete Stale Devices (inactive for > 90 days)
        // These are likely abandoned browsers or uninstallations that we can't track otherwise.
        const staleRes = await client.query(`
            DELETE FROM user_devices
            WHERE last_seen_at < NOW() - INTERVAL '90 days'
        `);

        // 2. Delete Invalidated Devices (invalid for > 7 days)
        // These keys failed to send push notifications and were marked as invalid.
        // We keep them for a short while for debugging/logs, then purge.
        const invalidRes = await client.query(`
            DELETE FROM user_devices
            WHERE invalidated_at < NOW() - INTERVAL '7 days'
        `);

        await client.query('COMMIT');

        const deletedCount = (staleRes.rowCount || 0) + (invalidRes.rowCount || 0);
        console.log(`[Cron] Device cleanup: Removed ${staleRes.rowCount} stale and ${invalidRes.rowCount} invalid devices.`);

        return NextResponse.json({
            success: true,
            deleted: {
                stale: staleRes.rowCount,
                invalid: invalidRes.rowCount
            }
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Device cleanup cron error:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    } finally {
        client.release();
    }
}
