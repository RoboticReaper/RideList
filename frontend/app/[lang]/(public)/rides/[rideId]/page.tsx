
import { useServerTranslation } from '@/app/i18n/server';
import { Metadata } from 'next';
import { pool } from '@/app/api/lib/db';
import dayjs, { CHICAGO_TZ } from '@/utils/dateUtils';
import RideContent from './RideContent';

type Props = {
    params: Promise<{ rideId: string; lang: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { lang, rideId } = await params;
    const { t } = await useServerTranslation(lang, 'common');

    try {
        const result = await pool.query(
            `SELECT from_text, to_text, departure_time, modified_at, status
             FROM trips WHERE id = $1 LIMIT 1`,
            [rideId]
        );

        if (result.rowCount && result.rowCount > 0) {
            const row = result.rows[0];
            const formattedTime = dayjs(row.departure_time)
                .tz(CHICAGO_TZ)
                .format('MMM D, YYYY h:mm A');

            return {
                title: `${row.from_text} → ${row.to_text} | ${formattedTime}`,
                description: t('metadata.rideDetails.description'),
                robots: {
                    index: row.status === 'bookable',
                    follow: row.status === 'bookable',
                },
                other: {
                    'modified_at': row.modified_at?.toISOString?.() ?? String(row.modified_at),
                },
            };
        }
    } catch (e) {
        console.error('generateMetadata: failed to fetch trip', e);
    }

    return {
        title: t('metadata.rideDetails.title'),
        description: t('metadata.rideDetails.description')
    };
}

export default async function RidePage() {
    return <RideContent />;
}
