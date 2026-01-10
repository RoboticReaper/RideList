import { PoolClient } from 'pg';

import { parsePostgresIntervalToMs } from './intervalUtils';

/**
 * Helper to parse a Postgres interval object or number into milliseconds.
 * Postgres node driver often returns intervals as objects like { hours: 1, minutes: 30 }.
 * Sometimes it might be returned as a number if pre-processed, or null.
 */
// Replaced by import

import { logTripEvent } from './tripEvents';
import { PostgresInterval } from './intervalUtils';
import { createNotification } from './createNotification';
import { markTripAsDone, markTripAsDeparted } from './tripActions';

/**
 * Pure function determines if check-in should be started.
 * 
 * Logic:
 * 1. Calculate startDate = departure - interval.
 * 2. If now >= startDate, return true.
 * 
 * Edge case:
 * - If interval is 0 (null/empty), startDate = departure.
 *   So if now >= departure, we auto-enable check-in as a fallback.
 */
export function shouldStartCheckIn(now: Date, departure: Date, interval: PostgresInterval | number | null | undefined): boolean {
    const intervalMs = parsePostgresIntervalToMs(interval);

    // start check-in time = departure - interval
    const startCheckInTime = new Date(departure.getTime() - intervalMs);

    return now >= startCheckInTime;
}

export async function checkAndProcessCheckInStart(client: PoolClient, tripId: string): Promise<boolean> {
    try {
        // 1. Fetch Trip Info needed for check: departure_time, start_check_in status, and rule setting
        const query = `
            SELECT 
                t.departure_time,
                t.start_check_in,
                t.driver,
                t.status,
                t.actual_departure_time,
                t.car,
                tr.start_check_in_hrs_before_departure,
                tr.departure_time_flexibility
            FROM trips t
            LEFT JOIN trip_rules tr ON t.id = tr.id
            WHERE t.id = $1
            FOR UPDATE OF t
        `;
        const res = await client.query(query, [tripId]);

        if (res.rowCount === 0) return false;

        const {
            departure_time,
            start_check_in,
            start_check_in_hrs_before_departure,
            driver,
            status,
            actual_departure_time,
            departure_time_flexibility,
            car
        } = res.rows[0];

        // 2. Auto-Complete Check (12 Hours after actual departure)
        const now = new Date();

        if (status === 'departed' && actual_departure_time) {
            const actualDep = new Date(actual_departure_time);
            const diffMs = now.getTime() - actualDep.getTime();
            const hoursPassed = diffMs / (1000 * 60 * 60);

            if (hoursPassed > 12) {
                console.log(`[Lazy Check-in] Auto-completing trip ${tripId} (Departed > 12h)`);
                await markTripAsDone(client, tripId, null);
                return true;
            }

        }

        // 3. Auto-Depart Check (Tardy > 15m)
        const allowedStatuses = ['bookable', 'locked', 'full'];
        if (allowedStatuses.includes(status) && car) {
            const flexMs = (departure_time_flexibility === null || departure_time_flexibility === undefined)
                ? 15 * 60 * 1000
                : parsePostgresIntervalToMs(departure_time_flexibility);
            const tardyGraceMs = 15 * 60 * 1000;
            const autoDepartCutoff = new Date(new Date(departure_time).getTime() + flexMs + tardyGraceMs);

            if (now > autoDepartCutoff) {
                // Check for active bookings
                const activeBookingsCount = await client.query(`
                    SELECT 1 FROM bookings 
                    WHERE trip = $1 
                    AND status IN ('confirmed', 'pending_pay_confirmation_from_driver')
                    LIMIT 1
                `, [tripId]);

                if ((activeBookingsCount.rowCount ?? 0) > 0) {
                    console.log(`[Lazy Check-in] Auto-departing trip ${tripId} (Tardy > 15m)`);
                    await markTripAsDeparted(client, tripId, null);
                    return true;
                }
            } else if (now > new Date(new Date(departure_time).getTime() + flexMs)) {
                // Tardy Grace Period Warning (0 < Lateness < 15m)
                // Check if we already warned for this specific lateness to avoid spam
                // We use trip_events to track this state (event_type = 'trip_late_warning')
                const activeBookingsCount = await client.query(`
                    SELECT 1 FROM bookings 
                    WHERE trip = $1 
                    AND status IN ('confirmed', 'pending_pay_confirmation_from_driver')
                    LIMIT 1
                `, [tripId]);

                if ((activeBookingsCount.rowCount ?? 0) > 0) {
                    const warningCheck = await client.query(`
                        SELECT 1 FROM trip_events 
                        WHERE trip = $1 AND event_type = 'trip_late_warning'
                        LIMIT 1
                    `, [tripId]);

                    if (warningCheck.rowCount === 0) {


                        // Calculate time when system will auto-depart
                        // autoDepartCutoff is already Date object
                        const timeString = autoDepartCutoff.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

                        await createNotification({
                            client,
                            type: 'trip_late_warning',
                            titleKey: 'notifications.types.trip_late_warning.title',
                            messageKey: 'notifications.types.trip_late_warning.message',
                            variables: { time: timeString },
                            userId: driver,
                            entityType: 'trips',
                            entityId: tripId,
                            openLink: `/dashboard/${tripId}`,
                            role: 'driver'
                        });

                        await logTripEvent({
                            client,
                            tripId,
                            eventType: 'trip_late_warning',
                            affectedEntities: ['trips'],
                            actorId: null, // System
                            notes: 'Sent late warning notification'
                        });
                    }
                }
            }
        }

        // 4. Check-In Logic
        // If already started, nothing to do
        if (start_check_in) return true;

        // 4. Check Logic
        const departure = new Date(departure_time);

        if (shouldStartCheckIn(now, departure, start_check_in_hrs_before_departure)) {
            // 3. Update Status
            await client.query(`UPDATE trips SET start_check_in = true, modified_at = NOW() WHERE id = $1`, [tripId]);
            console.log(`[Lazy Check-in] Auto-started check-in for trip ${tripId}`);

            // 4. Log Trip Event (System Update)
            await logTripEvent({
                client,
                tripId,
                actorId: null, // System
                eventType: 'trip_updated',
                affectedEntities: ['trips'],
                changes: { trip: { start_check_in: { old: false, new: true } } }
            });

            createNotification({
                client,
                type: 'check_in_started',
                titleKey: 'notifications.types.check_in_started.title',
                messageKey: 'notifications.types.check_in_started.message',
                userId: driver,
                entityType: 'trips',
                entityId: tripId,
                openLink: `/dashboard/${tripId}`,
                role: 'driver'
            });

            // 5. Notify Riders
            const bookingRes = await client.query(`
                SELECT rider 
                FROM bookings 
                WHERE trip = $1 
                AND status IN ('joined_with_pay_window', 'pending_pay_confirmation_from_driver', 'confirmed')
            `, [tripId]);

            for (const row of bookingRes.rows) {
                await createNotification({
                    client,
                    type: 'check_in_started',
                    titleKey: 'notifications.types.check_in_started.title',
                    messageKey: 'notifications.types.check_in_started.message',
                    userId: row.rider,
                    entityType: 'trips',
                    entityId: tripId,
                    openLink: `/dashboard/${tripId}`,
                    role: 'rider'
                });
            }

            return true;
        }

        return false;

    } catch (error) {
        console.error(`[Lazy Check-in] Error processing trip ${tripId}:`, error);
        // Don't throw, just log. This is a background maintenance task usually.
        return false;
    }
}
