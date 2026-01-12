import { useServerTranslation } from '@/app/i18n/server';
import { Metadata } from 'next';
import RuleTemplatesContent from './RuleTemplatesContent';

type Props = {
    params: Promise<{ lang: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { lang } = await params;
    const { t } = await useServerTranslation(lang, 'common');
    return {
        title: t('metadata.ruleTemplates.title'),
        description: t('metadata.ruleTemplates.description'),
    };
}

export default async function RuleTemplatesPage() {
    return <RuleTemplatesContent />;
}
