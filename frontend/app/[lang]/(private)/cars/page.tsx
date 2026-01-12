import { useServerTranslation } from '@/app/i18n/server';
import { Metadata } from 'next';
import CarsContent from './CarsContent';

type Props = {
    params: Promise<{ lang: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { lang } = await params;
    const { t } = await useServerTranslation(lang, 'common');
    return {
        title: t('metadata.cars.title'),
        description: t('metadata.cars.description'),
    };
}

export default async function CarsPage() {
    return <CarsContent />;
}
