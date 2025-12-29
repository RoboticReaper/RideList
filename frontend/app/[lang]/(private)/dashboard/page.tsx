'use client';

import { useDashboard } from '@/app/[lang]/(private)/DashboardContext';
import { DriverDashboard } from './components/DriverDashboard';
import { RiderDashboard } from './components/RiderDashboard';
import { Container, Title } from '@mantine/core';

export default function DashboardPage() {
    const { role } = useDashboard();

    return (
        <Container size="xl" py="xl">
            <Title order={2} mb="lg">{role === 'driver' ? 'Driver' : 'Rider'} Dashboard</Title>
            {role === 'driver' ? (
                <DriverDashboard />
            ) : (
                <RiderDashboard />
            )}
        </Container>
    );
}