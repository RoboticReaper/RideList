import { useServerTranslation } from '@/app/i18n/server';
import { Metadata } from 'next';
import HistoryContent from './HistoryContent';

type Props = {
    params: Promise<{ lang: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { lang } = await params;
    const { t } = await useServerTranslation(lang, 'common');
    return {
        title: t('metadata.history.title'),
        description: t('metadata.history.description'),
    };
}

export default async function HistoryPage() {
    return <HistoryContent />;
}
