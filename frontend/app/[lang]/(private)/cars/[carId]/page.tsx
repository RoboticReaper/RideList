import { useServerTranslation } from '@/app/i18n/server';
import { Metadata } from 'next';
import CarEditContent from './CarEditContent';

type Props = {
    params: Promise<{ lang: string; carId: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { lang } = await params;
    const { t } = await useServerTranslation(lang, 'common');

    return {
        title: `${t('metadata.editCar.title')}`,
        description: t('metadata.editCar.description')
    };
}

export default async function CarEditPage() {
    return <CarEditContent />;
}
