import { useServerTranslation } from '@/app/i18n/server';
import { Metadata } from 'next';
import TripTemplatesContent from './TripTemplatesContent';

type Props = {
    params: Promise<{ lang: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { lang } = await params;
    const { t } = await useServerTranslation(lang, 'common');
    return {
        title: t('metadata.tripTemplates.title'),
        description: t('metadata.tripTemplates.description'),
    };
}

export default async function TripTemplatesPage() {
    return <TripTemplatesContent />;
}
