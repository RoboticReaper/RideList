import { useServerTranslation } from '@/app/i18n/server';
import { Metadata } from 'next';
import DashboardContent from './DashboardContent';

type Props = {
    params: Promise<{ lang: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { lang } = await params;
    const { t } = await useServerTranslation(lang, 'common');
    return {
        title: t('metadata.dashboard.title'),
        description: t('metadata.dashboard.description'),
    };
}

export default async function DashboardPage() {
    return <DashboardContent />;
}
