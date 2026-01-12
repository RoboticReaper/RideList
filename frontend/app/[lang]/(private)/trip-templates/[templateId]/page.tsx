import { useServerTranslation } from '@/app/i18n/server';
import { Metadata } from 'next';
import TripTemplateEditContent from './TripTemplateEditContent';

type Props = {
    params: Promise<{ lang: string; templateId: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { lang } = await params;
    const { t } = await useServerTranslation(lang, 'common');

    return {
        title: `${t('metadata.editTripTemplate.title')}`,
        description: t('metadata.editTripTemplate.description')
    };
}

export default async function TripTemplateEditPage() {
    return <TripTemplateEditContent />;
}
