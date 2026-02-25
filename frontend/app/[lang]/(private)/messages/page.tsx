import { useServerTranslation } from '@/app/i18n/server';
import { Metadata } from 'next';
import MessagesContent from './MessagesContent';

type Props = {
    params: Promise<{ lang: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { lang } = await params;
    const { t } = await useServerTranslation(lang, 'common');
    return {
        title: t('metadata.messages.title'),
        description: t('metadata.messages.description'),
    };
}

export default async function MessagesPage() {
    return <MessagesContent />;
}
