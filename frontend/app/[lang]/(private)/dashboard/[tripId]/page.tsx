'use client';
import { useEffect, useState, use, useCallback } from 'react';
import { Container, Title, Tabs, Loader, Alert, Button, Group } from '@mantine/core';
import { useAuth } from '@/components/firebase/AuthContext';
import { IconUsers, IconEdit, IconArrowLeft, IconExternalLink, IconRefresh } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { ManageTripView } from './components/ManageTripView';
import { EditTripView } from './components/EditTripView';
import { RiderTripView } from './components/RiderTripView';
import { LocalizedLink } from '@/components/LocalizedLink';

export default function TripManagementPage({ params }: { params: Promise<{ tripId: string }> }) {
    const { tripId } = use(params);
    const { user } = useAuth();
    const router = useRouter();

    const [trip, setTrip] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<string | null>('manage');
    const [lastRefreshed, setLastRefreshed] = useState(new Date());

    const fetchTrip = useCallback(async () => {
        if (!user) return;
        try {
            const token = await user.getIdToken();
            const res = await fetch(`/api/trips/${tripId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) throw new Error('Failed to fetch trip details');
            const data = await res.json();

            setTrip(data);
            setLastRefreshed(new Date());
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [user, tripId]);

    useEffect(() => {
        fetchTrip();

        const interval = setInterval(() => {
            fetchTrip();
        }, 120000); // 2 minutes

        return () => clearInterval(interval);
    }, [fetchTrip]);

    const refreshTrip = () => {
        fetchTrip();
    };

    if (loading) return <Container py="xl"><Loader /></Container>;

    if (error) return (
        <Container py="xl">
            <Alert color="red" title="Error">{error}</Alert>
        </Container>
    );

    if (!trip) return null;

    if (!trip.isDriver) {
        return (
            <Container size="xl">
                <Group mb="lg">
                    <Button component={LocalizedLink} href="/dashboard" variant="subtle" leftSection={<IconArrowLeft size={16} />}>
                        Back to Dashboard
                    </Button>
                    <Button component={LocalizedLink} href={`/rides/${tripId}`} variant="outline" leftSection={<IconExternalLink size={16} />}>
                        View Public Posting
                    </Button>
                    <Button variant="outline" leftSection={<IconRefresh size={16} />} onClick={refreshTrip}>
                        Refresh
                    </Button>
                </Group>
                <Title order={2} mb="xl">
                    {trip.from_text.split(',')[0]} &rarr; {trip.to_text.split(',')[0]}
                </Title>
                <RiderTripView trip={trip} onRefresh={refreshTrip} />
            </Container>
        );
    }

    return (
        <>
            <Group mb="md" gap="xs">
                <Button component={LocalizedLink} href="/dashboard" variant="subtle" leftSection={<IconArrowLeft size={16} />} pr="xs" size="xs" pl={0}>
                    Back
                </Button>
                <Button component={LocalizedLink} href={`/rides/${tripId}`} variant="outline" leftSection={<IconExternalLink size={16} />} px="xs" size="xs">
                    Details
                </Button>
                <Button variant="outline" leftSection={<IconRefresh size={16} />} onClick={refreshTrip} px="xs" size="xs">
                    Refresh
                </Button>
            </Group>

            <Title order={2} mb="lg">
                {trip.from_text.split(',')[0]} &rarr; {trip.to_text.split(',')[0]}
            </Title>

            <Tabs value={activeTab} onChange={setActiveTab}>
                <Tabs.List>
                    <Tabs.Tab value="manage" leftSection={<IconUsers size={14} />}>
                        Manage Trip
                    </Tabs.Tab>
                    <Tabs.Tab value="edit" leftSection={<IconEdit size={14} />}>
                        Edit Trip
                    </Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="manage" pt="lg">
                    <ManageTripView tripId={tripId} tripStatus={trip.status} onStatusChange={refreshTrip} lastRefreshed={lastRefreshed} />
                </Tabs.Panel>

                <Tabs.Panel value="edit" pt="lg">
                    <EditTripView trip={trip} />
                </Tabs.Panel>
            </Tabs>
        </>
    );
}
