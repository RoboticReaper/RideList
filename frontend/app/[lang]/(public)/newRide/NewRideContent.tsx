'use client'

import { TripInputBar } from '@/components/TripInputBar/TripInputBar';
import { Container, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';

export default function NewRidePage() {
    const { t } = useTranslation('common');
    return (
        <Container size="xl" py="xl">
            <Title order={2} mb="lg">{t('rides.create.title')}</Title>
            <TripInputBar />
        </Container>
    );
}