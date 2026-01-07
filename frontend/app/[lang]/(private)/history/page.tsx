'use client';

import { useDashboard } from '@/app/[lang]/(private)/DashboardContext';
import { DriverHistory } from './components/DriverHistory';
import { RiderHistory } from './components/RiderHistory';
import { Container, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';

export default function HistoryPage() {
    const { t } = useTranslation('common');
    const { role } = useDashboard();

    return (
        <Container size="xl" pb="xl" pt="sm">
            <Title order={2} mb="lg">{role === 'driver' ? t('history.driver.title') : t('history.rider.title')}</Title>
            {role === 'driver' ? (
                <DriverHistory />
            ) : (
                <RiderHistory />
            )}
        </Container>
    );
}