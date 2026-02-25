import { PoolClient } from 'pg';
import { getTranslationForUser } from './i18n';

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

    const t = await getTranslationForUser(driverId, client);

    if (profileRes.rowCount === 0) {
        throw new Error(t('api.errors.driverProfileNotFound'));
    }

    const { phone } = profileRes.rows[0];
    if (!phone || phone.trim() === '') {
        throw new Error(t('api.errors.driverPhoneRequired'));
    }

    // 2. Check if the trip has a car assigned
    const tripRes = await client.query(
        'SELECT car FROM trips WHERE id = $1',
        [tripId]
    );

    if (tripRes.rowCount === 0) {
        throw new Error(t('api.errors.tripNotFound'));
    }

    // No longer require a car for trip departure
    // if (!tripRes.rows[0].car) {
    //     throw new Error(t('api.errors.carRequiredForDeparture'));
    // }
}
