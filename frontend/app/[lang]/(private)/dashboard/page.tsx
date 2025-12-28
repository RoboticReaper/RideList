'use client';

import { useDashboard } from '@/app/[lang]/(private)/DashboardContext';
import { DriverDashboard } from './components/DriverDashboard';
import { Container, Title } from '@mantine/core';

export default function DashboardPage() {
    const { role } = useDashboard();

    return (
        <Container size="xl" py="xl">
            <Title order={2} mb="lg">Dashboard</Title>
            {role === 'driver' ? (
                <DriverDashboard />
            ) : (
                <div>Rider dashboard coming soon...</div>
            )}
        </Container>
    );
}