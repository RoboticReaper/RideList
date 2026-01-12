import { useServerTranslation } from '@/app/i18n/server';
import { Metadata } from 'next';
import HowContent from './HowContent';

type Props = {
    params: Promise<{ lang: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { lang } = await params;
    const { t } = await useServerTranslation(lang, 'common');
    return {
        title: t('metadata.how.title'),
        description: t('metadata.how.description'),
    };
}

export default async function HowPage() {
    return <HowContent />;
}
