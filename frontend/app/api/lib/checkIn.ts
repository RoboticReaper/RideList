import { PoolClient } from 'pg';

export async function checkAndProcessCheckInStart(client: PoolClient, tripId: string) {
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

        if (res.rowCount === 0) return;

        const { departure_time, start_check_in, start_check_in_hrs_before_departure } = res.rows[0];

        // If already started, nothing to do
        if (start_check_in) return;

        // If no auto-start rule is set, simple return (manual only or disabled)
        if (!start_check_in_hrs_before_departure || start_check_in_hrs_before_departure <= 0) return;

        // 2. Check Time
        const now = new Date();
        const departure = new Date(departure_time);
        const hrs = Number(start_check_in_hrs_before_departure);

        // Calculate the "start time" for check-in
        // start_time = departure - hrs
        const startTime = new Date(departure.getTime() - (hrs * 60 * 60 * 1000));

        if (now >= startTime) {
            // 3. Update Status
            await client.query(`UPDATE trips SET start_check_in = true WHERE id = $1`, [tripId]);
            console.log(`[Lazy Check-in] Auto-started check-in for trip ${tripId}`);
        }

    } catch (error) {
        console.error(`[Lazy Check-in] Error processing trip ${tripId}:`, error);
        // Don't throw, just log. This is a background maintenance task usually.
    }
}
