import { useServerTranslation } from '@/app/i18n/server';
import { Metadata } from 'next';
import PrivacyContent from './PrivacyContent';

type Props = {
    params: Promise<{ lang: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { lang } = await params;
    const { t } = await useServerTranslation(lang, 'common');
    return {
        title: t('metadata.privacy.title'),
        description: t('metadata.privacy.description'),
    };
}

export default async function PrivacyPage() {
    return <PrivacyContent />;
}
