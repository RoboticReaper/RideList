'use client';

import { Container, Title, Text, Button, Group } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '../../../../components/LocalizedLink';

export default function ErrorPage() {
    const { t } = useTranslation('common');

    return (
        <Container className="root" pt={80} pb={80}>
            <Title className="title" ta="center" fw={900} fz={38}>
                {t('globalError.title')}
            </Title>
            <Text c="dimmed" size="lg" ta="center" className="description" mx="auto" mt="xl" maw={500}>
                {t('globalError.description')}
            </Text>
            <Group justify="center" mt="xl">
                <Button component={LocalizedLink} href="/" size="md" variant="subtle">
                    {t('globalError.backToHome')}
                </Button>
            </Group>
        </Container>
    );
}
