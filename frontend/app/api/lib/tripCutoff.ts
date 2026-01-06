import { PoolClient } from 'pg';
import { createNotification, NOTIFICATION_TYPES } from './createNotification';

/**
 * Checks if a trip has passed its booking cutoff time.
 * If passed and status is 'bookable', updates status to 'locked'.
 * 
 * @param client - Database client
 * @param tripId - Trip ID
 * @returns The (potentially updated) status
 */
export async function checkAndProcessTripCutoff(client: PoolClient, tripId: string): Promise<string> {
    try {
        // Fetch trip status and cutoff check result directly
        // We use boolean logic in SQL to determine if we passed the cutoff
        const query = `
            SELECT 
                t.status,
                tr.cutoff_time,
                t.driver,
                CASE 
                    WHEN tr.cutoff_time IS NOT NULL THEN (NOW() >= (t.departure_time + COALESCE(tr.departure_time_flexibility, '0 seconds'::interval) - tr.cutoff_time))
                    ELSE (NOW() >= (t.departure_time + COALESCE(tr.departure_time_flexibility, '0 seconds'::interval)))
                END as is_past_cutoff
            FROM trips t
            LEFT JOIN trip_rules tr ON t.id = tr.id
            WHERE t.id = $1
            FOR UPDATE OF t
        `;

        const res = await client.query(query, [tripId]);

        if (res.rowCount === 0) {
            return 'not_found';
        }

        const { status, cutoff_time, is_past_cutoff, driver } = res.rows[0];

        // Only lock if currently bookable
        if (status !== 'bookable') {
            return status;
        }

        if (is_past_cutoff) {
            console.log(`Trip ${tripId} passed booking cutoff. Locking.`);

            await client.query(
                "UPDATE trips SET status = 'locked', modified_at = NOW() WHERE id = $1",
                [tripId]
            );

            // Log Trip Event (System Lock)
            const { logTripEvent } = await import('@/app/api/lib/tripEvents');
            await logTripEvent({
                client,
                tripId,
                actorId: null, // System
                eventType: 'trip_updated',
                affectedEntities: ['trips'],
                changes: { trip: { status: { old: 'bookable', new: 'locked' } } }
            });

            // Notify driver
            await createNotification({
                client,
                type: 'trip_auto_locked',
                title: 'Trip Locked',
                message: 'Your trip has been locked due to booking cutoff.',
                userId: driver,
                entityType: 'trips',
                entityId: tripId,
                openLink: `/dashboard/${tripId}`,
                role: 'driver'
            });

            return 'locked';
        }

        return status;

    } catch (e) {
        console.error("Error in checkAndProcessTripCutoff", e);
        // Fail open: return current status rather than crashing
        throw e;
    }
}
