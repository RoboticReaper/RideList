import { useServerTranslation } from '@/app/i18n/server';
import { Metadata } from 'next';
import RoleSettingsContent from './RoleSettingsContent';

type Props = {
    params: Promise<{ lang: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { lang } = await params;
    const { t } = await useServerTranslation(lang, 'common');
    return {
        title: t('metadata.roleSettings.title'),
        description: t('metadata.roleSettings.description'),
    };
}

export default async function RoleSettingsPage() {
    return <RoleSettingsContent />;
}
