'use client';
import { useEffect, useState, use, useCallback } from 'react';
import { Container, Title, Tabs, Loader, Alert, Button, Group, Badge, Text, Stack } from '@mantine/core';
import { useAuth } from '@/components/firebase/AuthContext';
import { IconUsers, IconEdit, IconArrowLeft, IconExternalLink, IconRefresh, IconCalendar } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { ManageTripView } from './components/ManageTripView';
import { EditTripView } from './components/EditTripView';
import { RiderTripView } from './components/RiderTripView';
import { LocalizedLink } from '@/components/LocalizedLink';
import { useDashboard } from '../../DashboardContext';
import { getTripStatusConfig } from '@/utils/statusUtils';

export default function TripManagementPage({ params }: { params: Promise<{ tripId: string }> }) {
    const { t } = useTranslation('common');
    const { tripId } = use(params);
    const { user } = useAuth();
    const { role, setRole } = useDashboard();
    const router = useRouter();

    const [trip, setTrip] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<string | null>('manage');
    const [lastRefreshed, setLastRefreshed] = useState(new Date());
    const [manualRefreshId, setManualRefreshId] = useState(0);

    const searchParams = useSearchParams();
    const pathname = usePathname();

    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab === 'manage' || tab === 'edit') {
            setActiveTab(tab);
            const params = new URLSearchParams(searchParams.toString());
            params.delete('tab');
            router.replace(`${pathname}?${params.toString()}`);
        }
    }, [searchParams, pathname, router]);

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

    // Auto-switch role based on trip participation
    useEffect(() => {
        if (trip) {
            if (trip.isDriver && role !== 'driver') {
                setRole('driver');
            } else if (!trip.isDriver && role !== 'rider') {
                setRole('rider');
            }
        }
    }, [trip, setRole]); // Intentionally omitting role to avoid loop, though logic handles it. Better to just run on trip load? 
    // Actually, if we include 'role' in dependency array, the effect runs when role changes.
    // Use case: User flips toggle -> role changes -> effect runs.
    // If we want to FORCE it back, we can. But the requirement says: "show a message... offering to switch".
    // So we should NOT auto-switch back immediately upon manual toggle. We should only auto-switch on initial load (trip change).
    // So let's rely on the rendering logic to block the view, and only auto-switch when trip is first loaded/identified.
    // To do this cleanly, we can check if `trip` just changed? Or just run it once when `trip` becomes available?
    // Let's settle for running when `trip` changes. If user manually changes role, `trip` doesn't change, so it won't auto-revert. Perfect. Note: relying on `trip` reference change. `setTrip` creates new reference.

    const refreshTrip = () => {
        setManualRefreshId(prev => prev + 1);
        fetchTrip();
    };

    if (loading) return <Container py="xl"><Loader /></Container>;

    if (error) return (
        <Container py="xl">
            <Alert color="red" title="Error">{error}</Alert>
        </Container>
    );

    if (!trip) return null;

    // Validation Layout
    const renderContent = () => {
        // Driver viewing Rider content (Invalid)
        if (role === 'rider' && trip.isDriver) {
            return (
                <Container py="xl">
                    <Alert color="blue" title={t('tripDetails.alerts.incorrectRole')} icon={<IconUsers />}>
                        <Stack gap="md">
                            <Text>{t('tripDetails.alerts.driverViewingRider')}</Text>
                            <Button onClick={() => setRole('driver')} variant="white" color="blue">
                                {t('tripDetails.alerts.switchToDriver')}
                            </Button>
                        </Stack>
                    </Alert>
                </Container>
            );
        }

        // Rider viewing Driver content (Invalid)
        if (role === 'driver' && !trip.isDriver) {
            return (
                <Container py="xl">
                    <Alert color="blue" title={t('tripDetails.alerts.incorrectRole')} icon={<IconUsers />}>
                        <Stack gap="md">
                            <Text>{t('tripDetails.alerts.riderViewingDriver')}</Text>
                            <Button onClick={() => setRole('rider')} variant="white" color="blue">
                                {t('tripDetails.alerts.switchToRider')}
                            </Button>
                        </Stack>
                    </Alert>
                </Container>
            );
        }

        // Correct Views
        const backLink = ['done', 'cancelled'].includes(trip.status) ? '/history' : '/dashboard';

        if (!trip.isDriver) {
            // Rider View matches role='rider' (or we just default to showing it if logic allows, but precise is better)
            return (
                <>
                    <Group mb="md" gap="xs">
                        <Button component={LocalizedLink} href={backLink} variant="subtle" leftSection={<IconArrowLeft size={16} />} pr="xs" size="xs" pl={0}>
                            {t('tripDetails.manage.actions.back')}
                        </Button>
                        <Button component={LocalizedLink} href={`/rides/${tripId}`} target="_blank" variant="outline" leftSection={<IconExternalLink size={16} />} px="xs" size="xs">
                            {t('dashboard.tripCard.viewPosting')}
                        </Button>
                        <Button variant="outline" leftSection={<IconRefresh size={16} />} onClick={refreshTrip} px="xs" size="xs">
                            {t('dashboard.common.refresh')}
                        </Button>
                    </Group>
                    <RiderTripView trip={trip} onRefresh={refreshTrip} />
                </>
            );
        }

        // Driver View matches role='driver'
        return (
            <>
                <Group mb="md" gap="xs">
                    <Button component={LocalizedLink} href={backLink} variant="subtle" leftSection={<IconArrowLeft size={16} />} pr="xs" size="xs" pl={0}>
                        {t('tripDetails.manage.actions.back')}
                    </Button>
                    <Button component={LocalizedLink} href={`/rides/${tripId}`} target="_blank" variant="outline" leftSection={<IconExternalLink size={16} />} px="xs" size="xs">
                        {t('dashboard.tripCard.viewPosting')}
                    </Button>
                    <Button variant="outline" leftSection={<IconRefresh size={16} />} onClick={refreshTrip} px="xs" size="xs">
                        {t('dashboard.common.refresh')}
                    </Button>
                </Group>

                <Stack gap={0} mb="lg">
                    <Title order={2}>
                        {trip.from_input_text?.split(',')[0]} &rarr; {trip.to_input_text?.split(',')[0]}
                    </Title>
                    <Group gap="md" align="center">
                        <Group gap="xs">
                            <IconCalendar size={18} style={{ opacity: 0.7 }} />
                            <Text size="lg" fw={500}>
                                {dayjs(trip.departure_time).format('MMM D, h:mm A')}
                            </Text>
                        </Group>
                        <Badge
                            size="md"
                            color={getTripStatusConfig(trip.status).color}
                        >
                            {t(getTripStatusConfig(trip.status).labelKey).toUpperCase()}
                        </Badge>
                        {trip.status !== "done" && trip.status !== "cancelled" && trip.start_check_in && (
                            <Badge
                                size="md"
                                color="cyan"
                            >
                                {t('dashboard.tripCard.checkInStarted')}
                            </Badge>
                        )}
                    </Group>
                </Stack>

                <Tabs value={activeTab} onChange={setActiveTab}>
                    <Tabs.List>
                        <Tabs.Tab value="manage" leftSection={<IconUsers size={14} />}>
                            {t('tripDetails.tabs.manage')}
                        </Tabs.Tab>
                        <Tabs.Tab value="edit" leftSection={<IconEdit size={14} />}>
                            {t('tripDetails.tabs.edit')}
                        </Tabs.Tab>
                    </Tabs.List>

                    <Tabs.Panel value="manage" pt="lg">
                        <ManageTripView tripId={tripId} tripStatus={trip.status} trip={trip} onStatusChange={refreshTrip} lastRefreshed={lastRefreshed} />
                    </Tabs.Panel>

                    <Tabs.Panel value="edit" pt="lg">
                        <EditTripView trip={trip} manualRefreshId={manualRefreshId} />
                    </Tabs.Panel>
                </Tabs>
            </>
        );
    };

    return renderContent();
}
