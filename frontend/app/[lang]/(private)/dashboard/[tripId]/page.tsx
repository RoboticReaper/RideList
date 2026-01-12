
import { useServerTranslation } from '@/app/i18n/server';
import { Metadata } from 'next';
import DashboardTripContent from './DashboardTripContent';

type Props = {
    params: Promise<{ tripId: string; lang: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { lang } = await params;
    const { t } = await useServerTranslation(lang, 'common');

    return {
        title: t('metadata.tripDashboardGeneric.title'),
        description: t('metadata.tripDashboardGeneric.description')
    };
}

export default async function DashboardTripPage(props: Props) {
    return <DashboardTripContent {...props} />;
}
