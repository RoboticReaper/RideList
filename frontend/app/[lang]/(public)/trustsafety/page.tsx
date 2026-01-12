import { useServerTranslation } from '@/app/i18n/server';
import { Metadata } from 'next';
import TrustSafetyContent from './TrustSafetyContent';

type Props = {
    params: Promise<{ lang: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { lang } = await params;
    const { t } = await useServerTranslation(lang, 'common');
    return {
        title: t('metadata.trust.title'),
        description: t('metadata.trust.description'),
    };
}

export default async function TrustSafetyPage() {
    return <TrustSafetyContent />;
}
