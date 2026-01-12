import { useServerTranslation } from '@/app/i18n/server';
import { Metadata } from 'next';
import TosContent from './TosContent';

type Props = {
    params: Promise<{ lang: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { lang } = await params;
    const { t } = await useServerTranslation(lang, 'common');
    return {
        title: t('metadata.tos.title'),
        description: t('metadata.tos.description'),
    };
}

export default async function TosPage() {
    return <TosContent />;
}
