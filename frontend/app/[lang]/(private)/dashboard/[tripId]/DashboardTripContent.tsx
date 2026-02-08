'use client';
import { useEffect, useState, use, useCallback } from 'react';
import { Container, Title, Tabs, Loader, Alert, Button, Group, Badge, Text, Stack } from '@mantine/core';
import { useAuth } from '@/components/firebase/AuthContext';
import { IconUsers, IconEdit, IconArrowLeft, IconExternalLink, IconRefresh, IconCalendar, IconMessage, IconFileText } from '@tabler/icons-react';
import dayjs, { CHICAGO_TZ } from '@/utils/dateUtils';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { ManageTripView } from './components/ManageTripView';
import { EditTripView } from './components/EditTripView';
import { RiderTripView } from './components/RiderTripView';
import { RiderChatView } from './components/RiderChatView';
import { DriverChatView } from './components/DriverChatView';
import { LocalizedLink } from '@/components/LocalizedLink';
import { useDashboard } from '../../DashboardContext';
import { getTripStatusConfig } from '@/utils/statusUtils';

import { Suspense } from 'react';

function TripManagementContent({ params }: { params: Promise<{ tripId: string }> }) {
    const { t } = useTranslation('common');
    const { tripId } = use(params);
    const { user } = useAuth();
    const { role, setRole } = useDashboard();
    const router = useRouter();

    const [trip, setTrip] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<string | null>('manage');
    const [riderActiveTab, setRiderActiveTab] = useState<string | null>('booking');
    const [lastRefreshed, setLastRefreshed] = useState(new Date());
    const [manualRefreshId, setManualRefreshId] = useState(0);

    const searchParams = useSearchParams();
    const pathname = usePathname();

    useEffect(() => {
        const tab = searchParams.get('tab');
        const chatThread = searchParams.get('chat_thread');
        const chatRecipient = searchParams.get('chat_recipient');

        // If chat params exist, auto-open the messages/chat tab
        if (chatThread || chatRecipient) {
            // For drivers, use 'messages' tab; for riders, use 'chat' tab
            if (role === 'driver') {
                setActiveTab('messages');
            } else {
                setRiderActiveTab('chat');
            }
        } else if (tab === 'manage' || tab === 'edit' || tab === 'messages') {
            setActiveTab(tab);
            const params = new URLSearchParams(searchParams.toString());
            params.delete('tab');
            router.replace(`${pathname}?${params.toString()}`);
        } else if (tab === 'booking' || tab === 'chat') {
            setRiderActiveTab(tab);
            const params = new URLSearchParams(searchParams.toString());
            params.delete('tab');
            router.replace(`${pathname}?${params.toString()}`);
        }
    }, [searchParams, pathname, router, role]);

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
        }, 30000); // 30 seconds - more responsive for action button updates

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
    }, [trip, setRole]);

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
            // Rider View with tabs
            return (
                <>
                    <Group mb="md" gap="xs">
                        <Button component={LocalizedLink} href={backLink} variant="subtle" leftSection={<IconArrowLeft size={16} />} pr="xs" size="xs" pl={0}>
                            {t('tripDetails.manage.actions.back')}
                        </Button>
                        <Button component={LocalizedLink} href={`/rides/${tripId}`} variant="outline" leftSection={<IconExternalLink size={16} />} px="xs" size="xs">
                            {t('dashboard.tripCard.viewPosting')}
                        </Button>
                        <Button variant="outline" leftSection={<IconRefresh size={16} />} onClick={refreshTrip} px="xs" size="xs">
                            {t('dashboard.common.refresh')}
                        </Button>
                    </Group>

                    <Tabs value={riderActiveTab} onChange={setRiderActiveTab}>
                        <Tabs.List>
                            <Tabs.Tab value="booking" leftSection={<IconFileText size={14} />}>
                                {t('tripDetails.tabs.bookingDetails') || 'Booking Details'}
                            </Tabs.Tab>
                            <Tabs.Tab value="chat" leftSection={<IconMessage size={14} />}>
                                {t('tripDetails.tabs.messages') || 'Messages'}
                            </Tabs.Tab>
                        </Tabs.List>

                        <Tabs.Panel value="booking" pt="lg">
                            <RiderTripView trip={trip} onRefresh={refreshTrip} />
                        </Tabs.Panel>

                        <Tabs.Panel value="chat" pt="lg">
                            <RiderChatView
                                tripId={tripId}
                                driverName={trip.driver?.name}
                                driverPhotoUrl={trip.driver?.photo_url}
                            />
                        </Tabs.Panel>
                    </Tabs>
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
                    <Button component={LocalizedLink} href={`/rides/${tripId}`} variant="outline" leftSection={<IconExternalLink size={16} />} px="xs" size="xs">
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
                                {dayjs(trip.departure_time).tz(CHICAGO_TZ).format('MMM D, h:mm A')}
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
                        <Tabs.Tab value="messages" leftSection={<IconMessage size={14} />}>
                            {t('tripDetails.tabs.messages')}
                        </Tabs.Tab>
                        <Tabs.Tab value="edit" leftSection={<IconEdit size={14} />}>
                            {t('tripDetails.tabs.edit')}
                        </Tabs.Tab>
                    </Tabs.List>

                    <Tabs.Panel value="manage" pt="lg">
                        <ManageTripView tripId={tripId} tripStatus={trip.status} trip={trip} onStatusChange={refreshTrip} lastRefreshed={lastRefreshed} />
                    </Tabs.Panel>

                    <Tabs.Panel value="messages" pt={0}>
                        <DriverChatView tripId={tripId} manualRefreshId={manualRefreshId} />
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

export default function TripManagementPage(props: { params: Promise<{ tripId: string }> }) {
    return (
        <Suspense fallback={<Container py="xl"><Loader /></Container>}>
            <TripManagementContent {...props} />
        </Suspense>
    );
}
