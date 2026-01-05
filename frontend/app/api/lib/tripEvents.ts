
import { PoolClient } from 'pg';

export type TripEventType =
    | 'trip_created'
    | 'trip_updated'
    | 'trip_cancelled'
    | 'trip_departed'
    | 'trip_completed'
    | 'trip_aborted'
    | 'paid_booking_cancelled_by_rider'
    | 'unpaid_booking_cancelled_by_rider'
    | 'system_cancelled';

interface LogTripEventArgs {
    client: PoolClient;
    tripId: string;
    actorId?: string | null; // null for system
    eventType: TripEventType;
    affectedEntities?: string[];
    changes?: Record<string, any>;
    notes?: string | null;
}

/**
 * Logs a semantic event to the trip_events table.
 * 
 * @param args - The event details.
 * @returns The UUID of the created event.
 */
export async function logTripEvent({
    client,
    tripId,
    actorId = null,
    eventType,
    affectedEntities = [],
    changes = {},
    notes = null
}: LogTripEventArgs): Promise<string> {
    const query = `
        INSERT INTO trip_events (
            trip, 
            actor_id, 
            event_type, 
            affected_entities, 
            changes, 
            notes
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
    `;

    const res = await client.query(query, [
        tripId,
        actorId,
        eventType,
        JSON.stringify(affectedEntities),
        JSON.stringify(changes),
        notes
    ]);

    return res.rows[0].id;
}
