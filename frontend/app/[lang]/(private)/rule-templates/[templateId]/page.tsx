import { useServerTranslation } from '@/app/i18n/server';
import { Metadata } from 'next';
import RuleTemplateEditContent from './RuleTemplateEditContent';

type Props = {
    params: Promise<{ lang: string; templateId: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { lang } = await params;
    const { t } = await useServerTranslation(lang, 'common');

    return {
        title: `${t('metadata.editRuleTemplate.title')}`,
        description: t('metadata.editRuleTemplate.description')
    };
}

export default async function RuleTemplateEditPage() {
    return <RuleTemplateEditContent />;
}
