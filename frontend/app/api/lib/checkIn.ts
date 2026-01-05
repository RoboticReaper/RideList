import { PoolClient } from 'pg';

import { parsePostgresIntervalToMs } from './intervalUtils';

/**
 * Helper to parse a Postgres interval object or number into milliseconds.
 * Postgres node driver often returns intervals as objects like { hours: 1, minutes: 30 }.
 * Sometimes it might be returned as a number if pre-processed, or null.
 */
// Replaced by import


import { PostgresInterval } from './intervalUtils';

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
                tr.start_check_in_hrs_before_departure
            FROM trips t
            LEFT JOIN trip_rules tr ON t.id = tr.id
            WHERE t.id = $1
            FOR UPDATE OF t
        `;
        const res = await client.query(query, [tripId]);

        if (res.rowCount === 0) return false;

        const { departure_time, start_check_in, start_check_in_hrs_before_departure } = res.rows[0];

        // If already started, nothing to do
        if (start_check_in) return true;

        // 2. Check Logic
        const now = new Date();
        const departure = new Date(departure_time);

        if (shouldStartCheckIn(now, departure, start_check_in_hrs_before_departure)) {
            // 3. Update Status
            await client.query(`UPDATE trips SET start_check_in = true, modified_at = NOW() WHERE id = $1`, [tripId]);
            console.log(`[Lazy Check-in] Auto-started check-in for trip ${tripId}`);

            // 4. Log Trip Event (System Update)
            const { logTripEvent } = await import('@/app/api/lib/tripEvents');
            await logTripEvent({
                client,
                tripId,
                actorId: null, // System
                eventType: 'trip_updated',
                affectedEntities: ['trips'],
                changes: { trip: { start_check_in: { old: false, new: true } } }
            });

            return true;
        }

        return false;

    } catch (error) {
        console.error(`[Lazy Check-in] Error processing trip ${tripId}:`, error);
        // Don't throw, just log. This is a background maintenance task usually.
        return false;
    }
}
