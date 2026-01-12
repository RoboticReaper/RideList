import { useServerTranslation } from '@/app/i18n/server';
import { Metadata } from 'next';
import ProfileContent from './ProfileContent';

type Props = {
    params: Promise<{ lang: string; uid: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { lang } = await params;
    const { t } = await useServerTranslation(lang, 'common');

    return {
        title: `${t('metadata.profile.title')}`,
        description: t('metadata.profile.description')
    };
}

export default async function ProfilePage() {
    return <ProfileContent />;
}
