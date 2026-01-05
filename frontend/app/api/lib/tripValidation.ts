import { PoolClient } from 'pg';

export async function checkDriverRequirementsForDeparture(
    client: PoolClient,
    driverId: string,
    tripId: string
) {
    // 1. Check if driver has a phone number in profile_global
    const profileRes = await client.query(
        'SELECT phone FROM profile_global WHERE id = $1',
        [driverId]
    );

    if (profileRes.rowCount === 0) {
        throw new Error('Driver profile not found.');
    }

    const { phone } = profileRes.rows[0];
    if (!phone || phone.trim() === '') {
        throw new Error('Driver must have a phone number set in their profile to start a trip.');
    }

    // 2. Check if the trip has a car assigned
    const tripRes = await client.query(
        'SELECT car FROM trips WHERE id = $1',
        [tripId]
    );

    if (tripRes.rowCount === 0) {
        throw new Error('Trip not found.');
    }

    if (!tripRes.rows[0].car) {
        throw new Error('A car must be assigned to the trip to start departure.');
    }
}
