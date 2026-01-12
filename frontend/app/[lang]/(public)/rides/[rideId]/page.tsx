
import { useServerTranslation } from '@/app/i18n/server';
import { Metadata } from 'next';
import RideContent from './RideContent';

type Props = {
    params: Promise<{ rideId: string; lang: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { lang } = await params;
    const { t } = await useServerTranslation(lang, 'common');

    return {
        title: t('metadata.rideDetails.title'),
        description: t('metadata.rideDetails.description')
    };
}

export default async function RidePage() {
    return <RideContent />;
}
