import { useServerTranslation } from '@/app/i18n/server';
import { Metadata } from 'next';
import { SearchContent } from './SearchContent';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
    const { lang } = await params;
    const { t } = await useServerTranslation(lang, 'common');
    return {
        title: t('metadata.search.title'),
        description: t('metadata.search.description'),
    };
}

export default async function RidesPage() {
    return <SearchContent />;
}