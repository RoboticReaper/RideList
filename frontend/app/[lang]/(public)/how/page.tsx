
import { Container, Title, Text, Timeline, Paper } from '@mantine/core';
import { IconSearch, IconArrowsSort, IconCalendarCheck } from '@tabler/icons-react';
import { useServerTranslation } from '@/app/i18n/server';

type Props = {
    params: Promise<{ lang: string }>;
};

export default async function HowPage({ params }: Props) {
    const { lang } = await params;
    const { t } = await useServerTranslation(lang, 'common');

    return (
        <Container size="md" py="xl">
            <Paper p="xl" radius="md" withBorder>
                <Title order={1} mb="lg" ta="center">{t('how.title')}</Title>
                <Text size="lg" mb="xl" fw={500} ta="center" c="dimmed">
                    {t('how.description')}
                </Text>

                <Timeline active={2} bulletSize={32} lineWidth={2}>
                    <Timeline.Item bullet={<IconSearch size={16} />} title={t('riderSteps.search')}>
                        <Text c="dimmed" size="sm" mt={4}>{t('how.steps.step1')}</Text>
                    </Timeline.Item>

                    <Timeline.Item bullet={<IconArrowsSort size={16} />} title={t('riderSteps.compare')}>
                        <Text c="dimmed" size="sm" mt={4}>{t('how.steps.step2')}</Text>
                    </Timeline.Item>

                    <Timeline.Item bullet={<IconCalendarCheck size={16} />} title={t('riderSteps.book')}>
                        <Text c="dimmed" size="sm" mt={4}>{t('how.steps.step3')}</Text>
                    </Timeline.Item>
                </Timeline>
            </Paper>
        </Container>
    );
}
