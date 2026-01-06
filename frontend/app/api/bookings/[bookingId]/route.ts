import { NextResponse } from 'next/server';
import { pool } from '@/app/api/lib/db';
import { verifyUserFromRequest } from '@/app/api/lib/verifyUser';
import { checkAndProcessPayWindowTimeout } from '@/app/api/lib/payWindow';
import { checkAndProcessCheckInStart } from '@/app/api/lib/checkIn';
import { createNotification } from '../../lib/createNotification';

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

        if (!['accept', 'reject', 'remove', 'confirm_payment', 'mark_picked_up'].includes(action)) {
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
                t.total_seats,
                t.status as trip_status
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

        // Global Read-Only Check for Trip Status
        const readOnlyTripStatuses = ['done', 'cancelled', 'aborted'];
        if (readOnlyTripStatuses.includes(booking.trip_status)) {
            await client.query('ROLLBACK');
            return NextResponse.json({ error: 'Trip is read-only because it is done, cancelled, or aborted.' }, { status: 400 });
        }

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

                await createNotification({
                    client,
                    type: 'pay_window_started',
                    title: 'Booking Accepted',
                    message: 'Your booking has been accepted by the driver. Please complete payment within the pay window.',
                    userId: booking.rider,
                    entityType: 'bookings',
                    entityId: bookingId,
                    openLink: `/dashboard/${booking.trip_id}`,
                    role: 'rider'
                })
                break;

            case 'reject':
                if (booking.status !== 'waiting_approval') {
                    await client.query('ROLLBACK');
                    return NextResponse.json({ error: 'Booking is not waiting for approval' }, { status: 400 });
                }
                newStatus = 'removed';
                seatsChange = 0; // Seats were never taken

                await createNotification({
                    client,
                    type: 'booking_rejected',
                    title: 'Booking Rejected',
                    message: 'Your booking has been rejected by the driver.',
                    userId: booking.rider,
                    entityType: 'bookings',
                    entityId: bookingId,
                    openLink: `/dashboard/${booking.trip_id}`,
                    role: 'rider'
                })
                break;

            case 'remove':
                if (booking.status === 'confirmed' && (booking.trip_status === 'departed' || readOnlyTripStatuses.includes(booking.trip_status))) {
                    await client.query('ROLLBACK');
                    return NextResponse.json({ error: 'Cannot remove a confirmed rider after the trip has departed, cancelled, aborted, or completed.' }, { status: 400 });
                }

                if (booking.status === 'joined_with_pay_window' || booking.status === 'pending_pay_confirmation_from_driver' || booking.status === 'confirmed') {
                    newStatus = 'removed';
                    seatsChange = -booking.seats_booked; // Release seats

                    await createNotification({
                        client,
                        type: 'booking_removed',
                        title: 'Booking Removed',
                        message: 'Your booking has been removed by the driver.',
                        userId: booking.rider,
                        entityType: 'bookings',
                        entityId: bookingId,
                        openLink: `/dashboard/${booking.trip_id}`,
                        role: 'rider'
                    })
                } else if (booking.status === 'waiting_approval') {
                    // Similar to reject
                    newStatus = 'removed';
                    seatsChange = 0;

                    await createNotification({
                        client,
                        type: 'booking_removed',
                        title: 'Booking Removed',
                        message: 'Your booking has been removed by the driver.',
                        userId: booking.rider,
                        entityType: 'bookings',
                        entityId: bookingId,
                        openLink: `/dashboard/${booking.trip_id}`,
                        role: 'rider'
                    })
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

                await createNotification({
                    client,
                    type: 'booking_confirmed',
                    title: 'Booking Confirmed',
                    message: 'Your payment and the booking has been confirmed by the driver.',
                    userId: booking.rider,
                    entityType: 'bookings',
                    entityId: bookingId,
                    openLink: `/dashboard/${booking.trip_id}`,
                    role: 'rider'
                })
                break;

            case 'mark_picked_up':
                if (booking.status !== 'confirmed') {
                    await client.query('ROLLBACK');
                    return NextResponse.json({ error: 'Booking must be confirmed to mark as picked up' }, { status: 400 });
                }
                // Check trip status, it must be 'departed'
                // We fetched t.status as trip_status
                if (booking.trip_status !== 'departed') {
                    await client.query('ROLLBACK');
                    return NextResponse.json({ error: 'Trip must be departed to mark riders as picked up' }, { status: 400 });
                }

                newStatus = booking.status;
                seatsChange = 0;

                // We need to perform the specific update for picked_up
                await client.query(
                    'UPDATE bookings SET picked_up = true, picked_up_at = NOW() WHERE id = $1',
                    [bookingId]
                );

                await createNotification({
                    client,
                    type: 'picked_up',
                    title: 'Booking Picked Up',
                    message: 'You have been picked up by the driver.',
                    userId: booking.rider,
                    entityType: 'bookings',
                    entityId: bookingId,
                    openLink: `/dashboard/${booking.trip_id}`,
                    role: 'rider'
                })
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
            const releaseRes = await client.query(
                'UPDATE trips SET seats_taken = seats_taken + $1 WHERE id = $2 RETURNING status, seats_taken, total_seats',
                [seatsChange, booking.trip_id]
            );

            if (releaseRes.rows.length > 0 && releaseRes.rows[0].status === 'full') {
                await client.query("UPDATE trips SET status = 'bookable', modified_at = NOW() WHERE id = $1", [booking.trip_id]);

                // Log Status Change (Full -> Bookable)
                const { logTripEvent } = await import('@/app/api/lib/tripEvents');
                await logTripEvent({
                    client,
                    tripId: booking.trip_id,
                    actorId: null,
                    eventType: 'trip_updated',
                    affectedEntities: ['trips'],
                    changes: { trip: { status: { old: 'full', new: 'bookable' } } },
                    notes: `status change due to driver removing booking with id ${bookingId}`
                });

                // Check cutoff immediately
                const { checkAndProcessTripCutoff } = await import('@/app/api/lib/tripCutoff');
                await checkAndProcessTripCutoff(client, booking.trip_id);
            }
        }

        // 3. Log Status History
        if (booking.status !== newStatus) {
            await client.query(
                `INSERT INTO booking_status_history (booking_id, actor_id, old_status, new_status)
                 VALUES ($1, $2, $3, $4)`,
                [bookingId, user.uid, booking.status, newStatus]
            );
        }

        // 4. Log Removal Reason (if removed)
        if (newStatus === 'removed') {
            let reasonText = reason;
            if (!reasonText) {
                reasonText = action === 'reject' ? 'Booking rejected by driver' : 'Removed by driver';
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
