import { useServerTranslation } from '@/app/i18n/server';
import { Metadata } from 'next';
import AuthContent from './AuthContent';

type Props = {
    params: Promise<{ lang: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { lang } = await params;
    const { t } = await useServerTranslation(lang, 'common');
    return {
        title: t('metadata.auth.title'),
        description: t('metadata.auth.description'),
    };
}

export default async function AuthPage() {
    return <AuthContent />;
}
