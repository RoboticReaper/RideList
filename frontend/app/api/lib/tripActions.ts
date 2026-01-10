import { PoolClient } from 'pg';
import { logTripEvent } from './tripEvents';
import { createNotification } from './createNotification';

/**
 * Marks a trip as 'done' (completed).
 * Handles all cascading side effects:
 * - Updates trip status
 * - Logs trip event
 * - Updates bookings (completed vs no_show)
 * - Updates profile stats (rider/driver)
 * - Sends notifications
 * 
 * Assumes the caller has already validated that the trip can be marked as done
 * (e.g. it is currently 'departed').
 */
export async function markTripAsDone(client: PoolClient, rideId: string, actorId: string | null) {
    // 1. Fetch current status for logging OLD state
    const oldRes = await client.query('SELECT status, driver FROM trips WHERE id = $1 FOR UPDATE', [rideId]);
    if (oldRes.rowCount === 0) throw new Error('Trip not found');
    const { status: oldStatus, driver: driverId } = oldRes.rows[0];

    // Refuse if already done
    if (oldStatus === 'done') return;

    // 2. Update Trip Status
    await client.query("UPDATE trips SET status = 'done', modified_at = NOW() WHERE id = $1", [rideId]);

    // 3. Log Event
    const eventId = await logTripEvent({
        client,
        tripId: rideId,
        actorId: actorId,
        eventType: 'trip_completed',
        affectedEntities: ['trips'],
        changes: { trip: { status: { old: oldStatus, new: 'done' } } }
    });

    // 4. Cascade Done to Bookings
    const bookingsToProcessRes = await client.query(`
        SELECT id, status, picked_up, rider 
        FROM bookings 
        WHERE trip = $1 
          AND status NOT IN ('pay_timeout', 'removed', 'left_paid', 'left_unpaid', 'cancelled', 'completed', 'no_show')
    `, [rideId]);

    const bookingsToProcess = bookingsToProcessRes.rows;

    for (const booking of bookingsToProcess) {
        let newBookingStatus = '';
        if (booking.picked_up) {
            newBookingStatus = 'completed';
        } else {
            newBookingStatus = 'no_show';
        }

        if (newBookingStatus && newBookingStatus !== booking.status) {
            await client.query('UPDATE bookings SET status = $1 WHERE id = $2', [newBookingStatus, booking.id]);
            await client.query(`
                INSERT INTO booking_status_history (booking_id, actor_id, old_status, new_status, trigger_event_id)
                VALUES ($1, $2, $3, $4, $5)
            `, [booking.id, actorId, booking.status, newBookingStatus, eventId]);

            // Increment Rider Completed Trips
            if (newBookingStatus === 'completed') {
                await client.query(`
                    UPDATE profile_rider 
                    SET completed_rides = COALESCE(completed_rides, 0) + 1 
                    WHERE id = $1
                `, [booking.rider]);
            }

            // Notify No Show Riders
            if (newBookingStatus === 'no_show') {
                await createNotification({
                    client,
                    type: 'marked_no_show',
                    title: 'Trip No Show',
                    message: 'You have been marked as no show.',
                    userId: booking.rider,
                    openLink: `/dashboard/${rideId}`,
                    entityType: 'trips',
                    entityId: rideId,
                    role: 'rider'
                });
            }
        }
    }

    // 5. Update Driver Stats
    // Check for at least 1 completed booking to prevent abuse
    const completedBookings = await client.query(
        "SELECT 1 FROM bookings WHERE trip = $1 AND status = 'completed' LIMIT 1",
        [rideId]
    );

    if ((completedBookings.rowCount ?? 0) > 0) {
        await client.query(`
            UPDATE profile_driver 
            SET completed_trips = COALESCE(completed_trips, 0) + 1 
            WHERE id = $1
        `, [driverId]);
    }
}

/**
 * Marks a trip as 'departed'.
 * Handles all cascading side effects:
 * - Updates trip status and actual_departure_time
 * - Snapshots the car
 * - Logs trip event
 * - Sends notifications
 */
export async function markTripAsDeparted(client: PoolClient, rideId: string, actorId: string | null) {
    // 1. Fetch current status
    const oldRes = await client.query(`
        SELECT t.status, t.driver, t.car, t.departure_time
        FROM trips t
        WHERE t.id = $1 
        FOR UPDATE
    `, [rideId]);

    if (oldRes.rowCount === 0) throw new Error('Trip not found');
    const oldTripState = oldRes.rows[0];

    if (oldTripState.status === 'departed') return;

    // 2. Update Status and Actual Departure Time
    await client.query(`
        UPDATE trips 
        SET status = 'departed', 
            actual_departure_time = NOW(), 
            modified_at = NOW() 
        WHERE id = $1
    `, [rideId]);

    // 3. Snapshot Car (System Logic: always snapshot current car)
    if (oldTripState.car) {
        await client.query(`
            INSERT INTO car_snapshots (
                id, original_car_id, make, model, seats, big_luggage, small_luggage, plate, color, year
            )
            SELECT 
                $1, id, make, model, seats, big_luggage, small_luggage, plate, color, year
            FROM cars 
            WHERE id = $2
        `, [rideId, oldTripState.car]);
    }

    // 4. Log Event
    await logTripEvent({
        client,
        tripId: rideId,
        actorId,
        eventType: 'trip_departed',
        affectedEntities: ['trips'],
        changes: { trip: { status: { old: oldTripState.status, new: 'departed' } } }
    });

    // 5. Notify Riders
    const activeRiders = await client.query(`
        SELECT rider FROM bookings 
        WHERE trip = $1 
        AND status IN ('confirmed', 'joined_with_pay_window', 'pending_pay_confirmation_from_driver')
    `, [rideId]);

    for (const r of activeRiders.rows) {
        await createNotification({
            client,
            type: 'trip_departed',
            title: 'Trip Departed',
            message: 'The driver has started the trip.',
            userId: r.rider,
            openLink: `/dashboard/${rideId}`,
            entityType: 'trips',
            entityId: rideId,
            role: 'rider'
        });
    }

    // 6. Notify Driver (if system action)
    if (!actorId) {
        await createNotification({
            client,
            type: 'trip_departed',
            title: 'Trip Auto-Departed',
            message: 'System auto-departed the trip due to driver inactivity.',
            userId: oldTripState.driver,
            openLink: `/dashboard/${rideId}`,
            entityType: 'trips',
            entityId: rideId,
            role: 'driver'
        });
    }
}
