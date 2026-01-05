'use client';

import { useDashboard } from '@/app/[lang]/(private)/DashboardContext';
import { DriverHistory } from './components/DriverHistory';
import { RiderHistory } from './components/RiderHistory';
import { Container, Title } from '@mantine/core';

export default function HistoryPage() {
    const { role } = useDashboard();

    return (
        <Container size="xl" pb="xl" pt="sm">
            <Title order={2} mb="lg">{role === 'driver' ? 'Driver' : 'Rider'} History</Title>
            {role === 'driver' ? (
                <DriverHistory />
            ) : (
                <RiderHistory />
            )}
        </Container>
    );
}