import { NextResponse } from 'next/server';
import { pool } from '@/app/api/lib/db';
import { verifyUserFromRequest } from '@/app/api/lib/verifyUser';
import { checkAndProcessPayWindowTimeout } from '@/app/api/lib/payWindow';

export async function POST(
    req: Request,
    { params }: { params: Promise<{ bookingId: string }> }
) {
    const { bookingId } = await params;
    const client = await pool.connect();

    try {
        const user = await verifyUserFromRequest(
            req.headers.get('authorization') ?? undefined
        );

        if (!user || !user.uid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await client.query('BEGIN');

        // Lazy Timeout Check
        await checkAndProcessPayWindowTimeout(client, bookingId);

        // Check booking ownership and current status
        // Locking row for consistency
        const bookingQuery = `
            SELECT id, rider, status
            FROM bookings
            WHERE id = $1
            FOR UPDATE
        `;
        const bookingRes = await client.query(bookingQuery, [bookingId]);

        if (bookingRes.rowCount === 0) {
            await client.query('ROLLBACK');
            return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
        }

        const booking = bookingRes.rows[0];

        if (booking.rider !== user.uid) {
            await client.query('ROLLBACK');
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        if (booking.status !== 'joined_with_pay_window') {
            await client.query('ROLLBACK');
            return NextResponse.json({ error: 'Booking is not awaiting payment' }, { status: 400 });
        }

        // Update status
        const updateQuery = `
            UPDATE bookings
            SET status = 'pending_pay_confirmation_from_driver'
            WHERE id = $1
        `;
        await client.query(updateQuery, [bookingId]);

        const statusHistoryQuery = `
            INSERT INTO booking_status_history (booking_id, actor_id, old_status, new_status)
            VALUES ($1, $2, $3, $4)
        `;
        await client.query(statusHistoryQuery, [bookingId, user.uid, 'joined_with_pay_window', 'pending_pay_confirmation_from_driver']);

        await client.query('COMMIT');

        return NextResponse.json({ success: true });

    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error("Mark Payment Sent Error:", error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    } finally {
        client.release();
    }
}
