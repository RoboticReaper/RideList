import { useServerTranslation } from '@/app/i18n/server';
import { Metadata } from 'next';
import SettingsContent from './SettingsContent';

type Props = {
    params: Promise<{ lang: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { lang } = await params;
    const { t } = await useServerTranslation(lang, 'common');
    return {
        title: t('metadata.settings.title'),
        description: t('metadata.settings.description'),
    };
}

export default async function SettingsPage() {
    return <SettingsContent />;
}
