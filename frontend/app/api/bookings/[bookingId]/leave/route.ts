import { NextResponse } from 'next/server';
import { pool } from '@/app/api/lib/db';
import { verifyUserFromRequest } from '@/app/api/lib/verifyUser';
import { checkAndProcessPayWindowTimeout } from '@/app/api/lib/payWindow';
import { checkAndProcessTripCutoff } from '@/app/api/lib/tripCutoff';
import { createNotification } from '@/app/api/lib/createNotification';

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
        const bookingQuery = `
            SELECT b.id, b.rider, b.trip, b.status, b.seats_booked, b.paid, t.status as trip_status, t.seats_taken as trip_seats_taken, t.driver
            FROM bookings b
            JOIN trips t ON b.trip = t.id
            WHERE b.id = $1
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

        // Global Read-Only Check
        if (booking.trip_status === 'done' || booking.trip_status === 'cancelled') {
            await client.query('ROLLBACK');
            return NextResponse.json({ error: 'Trip is read-only because it is done or cancelled.' }, { status: 400 });
        }

        // Check if booking is already inactive
        // Inactive statuses: pay_timeout, removed, left_paid, left_unpaid, cancelled.
        const inactiveStatuses = ['pay_timeout', 'removed', 'left_paid', 'left_unpaid', 'cancelled', 'rejected'];
        if (inactiveStatuses.includes(booking.status)) {
            await client.query('ROLLBACK');
            return NextResponse.json({ error: 'Booking is already inactive.' }, { status: 400 });
        }

        // Prevent leaving if confirmed and departed
        if (booking.status === 'confirmed' && booking.trip_status === 'departed') {
            await client.query('ROLLBACK');
            return NextResponse.json({ error: 'Cannot leave trip after it has departed.' }, { status: 400 });
        }



        // check if user already paid
        if (booking.paid) {
            // Update booking status
            const updateBookingQuery = `
                UPDATE bookings
                SET status = 'left_paid'
                WHERE id = $1
            `;
            await client.query(updateBookingQuery, [bookingId]);

            // Release seats if they were taken
            const activeStatuses = ['joined_with_pay_window', 'pending_pay_confirmation_from_driver', 'confirmed'];
            if (activeStatuses.includes(booking.status)) {
                const releaseSeatsQuery = `
                    UPDATE trips
                    SET seats_taken = seats_taken - $1
                    WHERE id = $2
                    RETURNING status
                `;
                const releaseRes = await client.query(releaseSeatsQuery, [booking.seats_booked, booking.trip]);

                if (releaseRes.rows.length > 0) {
                    const updatedTrip = releaseRes.rows[0];

                    if (updatedTrip.status === 'full') {
                        await client.query("UPDATE trips SET status = 'bookable' WHERE id = $1", [booking.trip]);

                        // Log Status Change (Full -> Bookable)
                        const { logTripEvent } = await import('@/app/api/lib/tripEvents');
                        await logTripEvent({
                            client,
                            tripId: booking.trip,
                            actorId: user.uid,
                            eventType: 'trip_updated',
                            affectedEntities: ['trips'],
                            changes: { trip: { status: { old: 'full', new: 'bookable' } } },
                            notes: `status change due to rider leave.`
                        });

                        // Notify driver
                        await createNotification({
                            client,
                            type: 'rider_left',
                            title: 'Rider Left',
                            message: 'Your paid rider has left the trip and the trip is now bookable again.',
                            userId: booking.driver,
                            entityType: 'bookings',
                            entityId: bookingId,
                            openLink: `/dashboard/${booking.trip}`,
                            role: 'driver'
                        });

                        // Check if we should lock it again immediately
                        await checkAndProcessTripCutoff(client, booking.trip);
                    } else {
                        // Notify driver
                        await createNotification({
                            client,
                            type: 'rider_left',
                            title: 'Rider Left',
                            message: 'Your paid rider has left the trip.',
                            userId: booking.driver,
                            entityType: 'bookings',
                            entityId: bookingId,
                            openLink: `/dashboard/${booking.trip}`,
                            role: 'driver'
                        });
                    }
                }
            }

            // Log booking status history
            const statusHistoryQuery = `
                INSERT INTO booking_status_history (booking_id, actor_id, old_status, new_status, trigger_event_id)
                VALUES ($1, $2, $3, $4, $5)
            `;
            await client.query(statusHistoryQuery, [bookingId, user.uid, booking.status, 'left_paid', null]);

        } else {
            // Update booking status
            const updateBookingQuery = `
                UPDATE bookings
                SET status = 'left_unpaid'
                WHERE id = $1
            `;
            await client.query(updateBookingQuery, [bookingId]);

            // Release seats if they were taken
            const activeStatuses = ['joined_with_pay_window', 'pending_pay_confirmation_from_driver', 'confirmed'];
            if (activeStatuses.includes(booking.status)) {
                const releaseSeatsQuery = `
                    UPDATE trips
                    SET seats_taken = seats_taken - $1
                    WHERE id = $2
                    RETURNING status
                `;
                const releaseRes = await client.query(releaseSeatsQuery, [booking.seats_booked, booking.trip]);

                if (releaseRes.rows.length > 0) {
                    let message = booking.status === 'pending_pay_confirmation_from_driver'
                        ? 'A rider pending your pay confirmation has left the trip'
                        : 'Your unpaid rider has left the trip';

                    if (releaseRes.rows[0].status === 'full') {
                        await client.query("UPDATE trips SET status = 'bookable' WHERE id = $1", [booking.trip]);
                        // Log Status Change (Full -> Bookable)
                        const { logTripEvent } = await import('@/app/api/lib/tripEvents');
                        await logTripEvent({
                            client,
                            tripId: booking.trip,
                            actorId: user.uid,
                            eventType: 'trip_updated',
                            affectedEntities: ['trips'],
                            changes: { trip: { status: { old: 'full', new: 'bookable' } } },
                            notes: `status change due to rider leave.`
                        });

                        // Notify driver
                        await createNotification({
                            client,
                            type: 'rider_left',
                            title: 'Rider Left',
                            message: message + ' and the trip is now bookable again.',
                            userId: booking.driver,
                            entityType: 'bookings',
                            entityId: bookingId,
                            openLink: `/dashboard/${booking.trip}`,
                            role: 'driver'
                        });

                        // Check if we should lock it again immediately
                        await checkAndProcessTripCutoff(client, booking.trip);
                    } else {
                        // Notify driver
                        await createNotification({
                            client,
                            type: 'rider_left',
                            title: 'Rider Left',
                            message: message + '.',
                            userId: booking.driver,
                            entityType: 'bookings',
                            entityId: bookingId,
                            openLink: `/dashboard/${booking.trip}`,
                            role: 'driver'
                        });
                    }
                }
            }

            // Log booking status history
            const statusHistoryQuery = `
                INSERT INTO booking_status_history (booking_id, actor_id, old_status, new_status, trigger_event_id)
                VALUES ($1, $2, $3, $4, $5)
            `;
            await client.query(statusHistoryQuery, [bookingId, user.uid, booking.status, 'left_unpaid', null]);
        }




        await client.query('COMMIT');

        return NextResponse.json({ success: true, paid: booking.paid });

    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error("Cancel Booking Error:", error);
        return NextResponse.json(
            { error: error.message || 'Internal Server Error' },
            { status: 500 }
        );
    } finally {
        client.release();
    }
}
