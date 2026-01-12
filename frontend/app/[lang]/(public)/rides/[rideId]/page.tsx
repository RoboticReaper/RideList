import { pool } from '@/app/api/lib/db';
import { useServerTranslation } from '@/app/i18n/server';
import { Metadata } from 'next';
import RideContent from './RideContent';

type Props = {
    params: Promise<{ rideId: string; lang: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { rideId, lang } = await params;

    try {
        const client = await pool.connect();
        try {
            const res = await client.query(
                'SELECT from_text, to_text FROM trips WHERE id = $1',
                [rideId]
            );

            if (res.rows.length > 0) {
                const { from_text, to_text } = res.rows[0];
                const { t } = await useServerTranslation(lang, 'common');
                return {
                    title: `${t('metadata.ride.title', { from: from_text, to: to_text })}`,
                    description: t('metadata.ride.description', { from: from_text, to: to_text })
                };
            }
        } finally {
            client.release();
        }
    } catch (e) {
        console.error("Metadata fetch error:", e);
    }

    return {
        title: 'Ride Details',
        description: 'View ride details on RideList.'
    };
}

export default async function RidePage() {
    return <RideContent />;
}
