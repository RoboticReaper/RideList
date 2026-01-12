import { useServerTranslation } from '@/app/i18n/server';
import { Metadata } from 'next';
import NewRideContent from './NewRideContent';

type Props = {
    params: Promise<{ lang: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { lang } = await params;
    const { t } = await useServerTranslation(lang, 'common');
    return {
        title: t('metadata.newRide.title'),
        description: t('metadata.newRide.description'),
    };
}

export default async function NewRidePage() {
    return <NewRideContent />;
}
