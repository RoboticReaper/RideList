import { pool } from '@/app/api/lib/db';
import { useServerTranslation } from '@/app/i18n/server';
import { Metadata } from 'next';
import DashboardTripContent from './DashboardTripContent';

type Props = {
    params: Promise<{ tripId: string; lang: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { tripId, lang } = await params;

    try {
        const client = await pool.connect();
        try {
            const res = await client.query(
                'SELECT from_text, to_text FROM trips WHERE id = $1',
                [tripId]
            );

            if (res.rows.length > 0) {
                const { from_text, to_text } = res.rows[0];
                const { t } = await useServerTranslation(lang, 'common');
                return {
                    title: `${t('metadata.tripDashboard.title', { from: from_text, to: to_text })}`,
                    description: t('metadata.tripDashboard.description', { from: from_text, to: to_text })
                };
            }
        } finally {
            client.release();
        }
    } catch (e) {
        console.error("Metadata fetch error:", e);
    }

    return {
        title: 'Trip Dashboard',
        description: 'Manage your trip on RideList.'
    };
}

export default async function DashboardTripPage(props: Props) {
    return <DashboardTripContent {...props} />;
}
