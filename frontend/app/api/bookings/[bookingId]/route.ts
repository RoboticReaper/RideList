import { NextResponse } from 'next/server';
import { pool } from '@/app/api/lib/db';
import { verifyUserFromRequest } from '@/app/api/lib/verifyUser';
import { checkAndProcessPayWindowTimeout } from '@/app/api/lib/payWindow';
import { checkAndProcessCheckInStart } from '@/app/api/lib/checkIn';

export async function PATCH(
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

        const body = await req.json();
        const { action, reason } = body;

        if (!['accept', 'reject', 'remove', 'confirm_payment'].includes(action)) {
            return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }


        await client.query('BEGIN');

        // Lazy Timeout Check
        await checkAndProcessPayWindowTimeout(client, bookingId);

        // Fetch Booking & Trip details with locking
        // We lock the trip row to ensure seat counts don't race
        const query = `
            SELECT 
                b.id,
                b.status,
                b.seats_booked,
                b.rider,
                t.id as trip_id,
                t.driver,
                t.seats_taken,
                t.total_seats
            FROM bookings b
            JOIN trips t ON b.trip = t.id
            WHERE b.id = $1
            FOR UPDATE OF t
        `;
        // Note: locking 't' usually provides enough serialization for 'seats_taken', 
        // assuming standard updates to 't' also lock it. 
        // If we only lock 'b', another transaction could update 't.seats_taken'.

        const res = await client.query(query, [bookingId]);

        if (res.rowCount === 0) {
            await client.query('ROLLBACK');
            return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
        }

        const booking = res.rows[0];

        // Lazy Check-in Start
        await checkAndProcessCheckInStart(client, booking.trip_id);

        // Authorization: Only driver can perform these actions
        if (booking.driver !== user.uid) {
            await client.query('ROLLBACK');
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        let newStatus = '';
        let seatsChange = 0;

        // State Machine Logic
        switch (action) {
            case 'accept':
                if (booking.status !== 'waiting_approval') {
                    await client.query('ROLLBACK');
                    return NextResponse.json({ error: 'Booking is not waiting for approval' }, { status: 400 });
                }

                // STRICT LIMIT CHECK
                if (booking.seats_taken + booking.seats_booked > booking.total_seats) {
                    await client.query('ROLLBACK');
                    return NextResponse.json({ error: 'Not enough seats available to accept this booking' }, { status: 400 });
                }

                newStatus = 'joined_with_pay_window';
                seatsChange = booking.seats_booked;
                break;

            case 'reject':
                if (booking.status !== 'waiting_approval') {
                    await client.query('ROLLBACK');
                    return NextResponse.json({ error: 'Booking is not waiting for approval' }, { status: 400 });
                }
                newStatus = 'removed';
                seatsChange = 0; // Seats were never taken
                break;

            case 'remove':
                if (booking.status === 'joined_with_pay_window' || booking.status === 'pending_pay_confirmation_from_driver' || booking.status === 'confirmed') {
                    newStatus = 'removed';
                    seatsChange = -booking.seats_booked; // Release seats
                } else if (booking.status === 'waiting_approval') {
                    // Similar to reject
                    newStatus = 'removed';
                    seatsChange = 0;
                } else {
                    await client.query('ROLLBACK');
                    return NextResponse.json({ error: 'Cannot remove booking in current status' }, { status: 400 });
                }
                break;

            case 'confirm_payment':
                if (booking.status !== 'pending_pay_confirmation_from_driver') {
                    await client.query('ROLLBACK');
                    return NextResponse.json({ error: 'Booking is not pending payment confirmation' }, { status: 400 });
                }
                newStatus = 'confirmed';
                seatsChange = 0; // Seats already taken
                break;
        }

        // Apply Updates

        // 1. Update Booking Status
        await client.query(
            'UPDATE bookings SET status = $1 WHERE id = $2',
            [newStatus, bookingId]
        );

        // 2. Update Trip Seats (if changed)
        if (seatsChange !== 0) {
            await client.query(
                'UPDATE trips SET seats_taken = seats_taken + $1 WHERE id = $2',
                [seatsChange, booking.trip_id]
            );
        }

        // 3. Log Status History
        await client.query(
            `INSERT INTO booking_status_history (booking_id, actor_id, old_status, new_status)
             VALUES ($1, $2, $3, $4)`,
            [bookingId, user.uid, booking.status, newStatus]
        );

        // 4. Log Removal Reason (if removed)
        if (newStatus === 'removed') {
            let reasonText = reason;
            if (!reasonText) {
                reasonText = action === 'reject' ? 'Rejected by driver' : 'Removed by driver';
            }
            await client.query(
                `INSERT INTO booking_removal (bid, actor_id, reason)
                 VALUES ($1, $2, $3)`,
                [bookingId, user.uid, reasonText]
            );
        }

        // 5. Update paid column to true if confirmed
        if (newStatus === 'confirmed') {
            await client.query(
                'UPDATE bookings SET paid = true WHERE id = $1',
                [bookingId]
            );
        }

        await client.query('COMMIT');

        return NextResponse.json({ success: true, status: newStatus });

    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error("Booking Action Error:", error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    } finally {
        client.release();
    }
}
