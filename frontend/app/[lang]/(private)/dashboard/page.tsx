'use client';

import { useDashboard } from '@/app/[lang]/(private)/DashboardContext';
import { DriverDashboard } from './components/DriverDashboard';
import { RiderDashboard } from './components/RiderDashboard';
import { Container, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';

export default function DashboardPage() {
    const { t } = useTranslation('common');
    const { role } = useDashboard();

    return (
        <Container size="xl" pb="xl" pt="sm">
            <Title order={2} mb="lg">{role === 'driver' ? t('headerMenu.roles.driver') : t('headerMenu.roles.rider')} {t('headerMenu.dashboard')}</Title>
            {role === 'driver' ? (
                <DriverDashboard />
            ) : (
                <RiderDashboard />
            )}
        </Container>
    );
}