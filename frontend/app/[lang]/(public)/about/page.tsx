
import { Container, Title, Text, Paper } from '@mantine/core';
import { useServerTranslation } from '@/app/i18n/server';

type Props = {
    params: Promise<{ lang: string }>;
};

export default async function AboutPage({ params }: Props) {
    const { lang } = await params;
    const { t } = await useServerTranslation(lang, 'common');

    return (
        <Container size="md" py="xl">
            <Paper p="xl" radius="md" withBorder>
                <Title order={1} mb="lg" ta="center">{t('about.title')}</Title>
                <Text size="lg" mb="md" fw={500} ta="center" c="dimmed">
                    {t('about.description')}
                </Text>
                <Text mt="xl" style={{ lineHeight: 1.6 }}>
                    {t('about.content')}
                </Text>
            </Paper>
        </Container>
    );
}
