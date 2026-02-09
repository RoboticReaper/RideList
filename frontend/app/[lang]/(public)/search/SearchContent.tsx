'use client';

import { RidesSearch } from '@/components/Rides/RidesSearch';
import { Title, Container, Box, Loader, Center, Button, Group, Modal, Stack, Text, Badge, Card, SimpleGrid, NumberInput, Select, Input, ActionIcon } from '@mantine/core';
import { RideList } from '@/components/Rides/RideList';
import { useTranslation } from 'react-i18next';
import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/firebase/AuthContext';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconListCheck, IconPlus, IconCheck, IconTrash, IconMapPin } from '@tabler/icons-react';
import dayjs, { toDateTimeLocalString, fromDateTimeLocalString, getChicagoNow, toChicagoISO, CHICAGO_TZ } from '@/utils/dateUtils';
import { DEFAULT_AUTOCOMPLETE_LOCATIONS } from '@/utils/defaultLocations';
import { Autocomplete, Loader as MantineLoader } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { intervalToMinutes, PostgresInterval } from '@/utils/intervalParsers';
import { useNotifications } from '@/components/Notifications/NotificationContext';

interface RideRequest {
    id: string;
    from_text: string;
    to_text: string;
    preferred_time: string;
    time_flexibility: string | PostgresInterval;
    seats: number;
    price: number | null;
    expires_at: string;
    status: string;
}

interface PlacePrediction {
    placePrediction: {
        placeId: string;
        text: { text: string };
    };
}

export function SearchContent() {
    const { t } = useTranslation('common');
    const searchParams = useSearchParams();
    const { user } = useAuth();
    const { showPrompt } = useNotifications();
    const [rides, setRides] = useState([]);
    const [loading, setLoading] = useState(true);
    const [mounted, setMounted] = useState(false);

    // Track client-side mount to avoid hydration mismatch
    useEffect(() => {
        setMounted(true);
    }, []);

    // My Requests Modal
    const [myRequestsOpened, { open: openMyRequests, close: closeMyRequests }] = useDisclosure(false);
    const [requests, setRequests] = useState<RideRequest[]>([]);
    const [loadingRequests, setLoadingRequests] = useState(false);
    const [updatingRequest, setUpdatingRequest] = useState<string | null>(null);

    // Post Request Modal
    const [postRequestOpened, { open: openPostRequest, close: closePostRequest }] = useDisclosure(false);
    const [submitting, setSubmitting] = useState(false);

    // Form state for posting request
    const [origin, setOrigin] = useState('');
    const [originCoords, setOriginCoords] = useState<{ lat: number; lng: number } | null>(null);
    const [originPlaceId, setOriginPlaceId] = useState<string | null>(null);
    const [originSuggestions, setOriginSuggestions] = useState<string[]>([]);
    const [loadingOrigin, setLoadingOrigin] = useState(false);

    const [destination, setDestination] = useState('');
    const [destCoords, setDestCoords] = useState<{ lat: number; lng: number } | null>(null);
    const [destPlaceId, setDestPlaceId] = useState<string | null>(null);
    const [destSuggestions, setDestSuggestions] = useState<string[]>([]);
    const [loadingDest, setLoadingDest] = useState(false);

    const [preferredTime, setPreferredTime] = useState<Date | null>(null);
    const [timeFlexibility, setTimeFlexibility] = useState<string | null>('1 hour');
    const [seats, setSeats] = useState<number | ''>(1);
    const [price, setPrice] = useState<number | ''>('');
    const [expiresAt, setExpiresAt] = useState<Date | null>(null);

    const predictionsMap = useRef<Map<string, string>>(new Map());
    const originSessionToken = useRef<string>(typeof crypto !== 'undefined' ? crypto.randomUUID() : '');
    const destSessionToken = useRef<string>(typeof crypto !== 'undefined' ? crypto.randomUUID() : '');
    const debounceTimeout = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        const fetchRides = async () => {
            setLoading(true);
            const params = new URLSearchParams(searchParams.toString());
            try {
                const res = await fetch(`/api/rides/searchrides?${params.toString()}`, {
                    cache: 'no-store'
                });
                if (!res.ok) {
                    console.error('Failed to fetch rides');
                    setRides([]);
                } else {
                    const data = await res.json();
                    setRides(data.rides || []);
                }
            } catch (e) {
                console.error('Fetch error', e);
                setRides([]);
            } finally {
                setLoading(false);
            }
        };

        fetchRides();
    }, [searchParams]);

    // Fetch user's active ride requests
    const fetchMyRequests = async () => {
        if (!user) return;
        setLoadingRequests(true);
        try {
            const token = await user.getIdToken();
            const res = await fetch('/api/ride-requests', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setRequests(data.requests || []);
            }
        } catch (e) {
            console.error('Failed to fetch requests', e);
        } finally {
            setLoadingRequests(false);
        }
    };

    useEffect(() => {
        if (myRequestsOpened && user) {
            fetchMyRequests();
        }
    }, [myRequestsOpened, user]);

    // Update request status
    const updateRequestStatus = async (requestId: string, status: 'fulfilled' | 'deleted') => {
        if (!user) return;
        setUpdatingRequest(requestId);
        try {
            const token = await user.getIdToken();
            const res = await fetch('/api/ride-requests', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ requestId, status })
            });
            if (res.ok) {
                notifications.show({
                    title: t('common.success'),
                    message: t('rides.rideRequests.updateSuccess'),
                    color: 'green'
                });
                // Refresh list
                fetchMyRequests();
            } else {
                const data = await res.json();
                notifications.show({
                    title: t('common.error'),
                    message: data.error || t('rides.rideRequests.error'),
                    color: 'red'
                });
            }
        } catch (e) {
            console.error('Failed to update request', e);
        } finally {
            setUpdatingRequest(null);
        }
    };

    // Places autocomplete helpers
    const fetchPlaces = async (query: string, setSuggestions: (data: string[]) => void, setLoading: (l: boolean) => void, sessionToken: string) => {
        if (!query || query.length < 3) {
            setSuggestions([]);
            return;
        }

        setLoading(true);
        try {
            const apiKey = process.env.NEXT_PUBLIC_PLACES_AUTOCOMPLETE!;
            const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': apiKey,
                },
                body: JSON.stringify({ input: query, sessionToken }),
            });

            if (!response.ok) {
                setLoading(false);
                return;
            }

            const data = await response.json();
            const newSuggestions: string[] = [];
            const seenTexts = new Set<string>();

            (data.suggestions || []).forEach((item: PlacePrediction) => {
                const text = item.placePrediction.text.text;
                const id = item.placePrediction.placeId;

                if (!seenTexts.has(text)) {
                    seenTexts.add(text);
                    newSuggestions.push(text);
                    predictionsMap.current.set(text, id);
                }
            });

            setSuggestions(newSuggestions);
        } catch (error) {
            console.error('Failed to fetch places', error);
        } finally {
            setLoading(false);
        }
    };

    const debounceFetch = (query: string, setSuggestions: (data: string[]) => void, setLoading: (l: boolean) => void, sessionToken: string) => {
        if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
        debounceTimeout.current = setTimeout(() => {
            fetchPlaces(query, setSuggestions, setLoading, sessionToken);
        }, 300);
    };

    const fetchPlaceDetails = async (placeId: string, setCoords: (c: { lat: number; lng: number } | null) => void) => {
        try {
            const apiKey = process.env.NEXT_PUBLIC_PLACES_AUTOCOMPLETE!;
            const response = await fetch(`https://places.googleapis.com/v1/places/${placeId}?fields=location`, {
                headers: { 'X-Goog-Api-Key': apiKey },
            });
            if (!response.ok) return;
            const data = await response.json();
            if (data.location) {
                setCoords({ lat: data.location.latitude, lng: data.location.longitude });
            }
        } catch (error) {
            console.error('Failed to fetch place details', error);
        }
    };

    const fetchPlaceIdFromQuery = async (query: string, sessionToken: string): Promise<string | null> => {
        try {
            const apiKey = process.env.NEXT_PUBLIC_PLACES_AUTOCOMPLETE!;
            const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': apiKey,
                },
                body: JSON.stringify({ input: query, sessionToken }),
            });
            if (!response.ok) return null;
            const data = await response.json();
            if (data.suggestions && data.suggestions.length > 0) {
                return data.suggestions[0].placePrediction.placeId;
            }
        } catch (e) {
            console.error('Failed to fetch place ID', e);
        }
        return null;
    };

    // Submit new ride request
    const handleSubmitRequest = async () => {
        if (!user) return;

        // Validation
        if (!origin || !originCoords) {
            notifications.show({ title: t('common.error'), message: t('rides.rideRequests.originRequired'), color: 'red' });
            return;
        }
        if (!destination || !destCoords) {
            notifications.show({ title: t('common.error'), message: t('rides.rideRequests.destRequired'), color: 'red' });
            return;
        }
        if (!preferredTime) {
            notifications.show({ title: t('common.error'), message: t('rides.rideRequests.timeRequired'), color: 'red' });
            return;
        }
        if (!timeFlexibility) {
            notifications.show({ title: t('common.error'), message: t('rides.rideRequests.flexRequired'), color: 'red' });
            return;
        }
        if (!seats || seats < 1) {
            notifications.show({ title: t('common.error'), message: t('rides.rideRequests.seatsRequired'), color: 'red' });
            return;
        }

        setSubmitting(true);
        try {
            const token = await user.getIdToken();
            const res = await fetch('/api/ride-requests', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    origin: {
                        text: origin,
                        lat: originCoords.lat,
                        lng: originCoords.lng,
                        placeId: originPlaceId,
                        sessionToken: originSessionToken.current
                    },
                    destination: {
                        text: destination,
                        lat: destCoords.lat,
                        lng: destCoords.lng,
                        placeId: destPlaceId,
                        sessionToken: destSessionToken.current
                    },
                    preferredTime: toChicagoISO(preferredTime),
                    timeFlexibility,
                    seats,
                    price: price || null,
                    expiresAt: expiresAt ? toChicagoISO(expiresAt) : null
                })
            });

            if (res.ok) {
                notifications.show({
                    title: t('common.success'),
                    message: t('rides.rideRequests.success'),
                    color: 'green'
                });
                closePostRequest();
                // Reset form
                setOrigin('');
                setOriginCoords(null);
                setDestination('');
                setDestCoords(null);
                setPreferredTime(null);
                setTimeFlexibility('1 hour');
                setSeats(1);
                setPrice('');
                setExpiresAt(null);
                // Prompt user to enable notifications
                showPrompt();
            } else {
                const data = await res.json();
                if (data.code === 'MAX_REQUESTS_EXCEEDED') {
                    notifications.show({
                        title: t('common.error'),
                        message: t('rides.rideRequests.maxRequestsReached'),
                        color: 'red'
                    });
                } else {
                    notifications.show({
                        title: t('common.error'),
                        message: data.error || t('rides.rideRequests.error'),
                        color: 'red'
                    });
                }
            }
        } catch (e) {
            console.error('Failed to submit request', e);
            notifications.show({
                title: t('common.error'),
                message: t('rides.rideRequests.error'),
                color: 'red'
            });
        } finally {
            setSubmitting(false);
        }
    };

    // Format flexibility for display
    const formatFlexibility = (flexibility: string | PostgresInterval) => {
        const totalMinutes = intervalToMinutes(flexibility);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = Math.round(totalMinutes % 60);
        if (hours > 0 && minutes > 0) return `± ${hours}h ${minutes}m`;
        if (hours > 0) return `± ${hours}h`;
        if (minutes > 0) return `± ${minutes}m`;
        return '± 0m';
    };

    // Convert ReadonlyURLSearchParams to the object format expected by RideList
    const rideListSearchParams: { [key: string]: string | string[] | undefined } = {};
    searchParams.forEach((value, key) => {
        const values = searchParams.getAll(key);
        if (values.length > 1) {
            rideListSearchParams[key] = values;
        } else {
            rideListSearchParams[key] = value;
        }
    });

    const renderRightSection = (loading: boolean, value: string, onClear: () => void) => {
        if (loading) return <MantineLoader size="xs" />;
        if (value) {
            return (
                <ActionIcon variant="transparent" color="gray" onClick={onClear}>
                    <IconX size={16} />
                </ActionIcon>
            );
        }
        return null;
    };

    return (
        <Container size="lg" py="xl" w="100%">
            <Title order={2} mb="md">{t('rides.search.title')}</Title>

            {/* Ride Request Buttons - Only show when signed in */}
            {mounted && user && (
                <Group mb="md" gap="sm">
                    <Button
                        variant="light"
                        leftSection={<IconListCheck size={18} />}
                        onClick={openMyRequests}
                    >
                        {t('rides.rideRequests.myRequests')}
                    </Button>
                    <Button
                        variant="light"
                        leftSection={<IconPlus size={18} />}
                        onClick={openPostRequest}
                    >
                        {t('rides.rideRequests.postRequest')}
                    </Button>
                </Group>
            )}
            {mounted && !user && (
                <Text size="sm" c="dimmed" mb="md">
                    {t('rides.rideRequests.loginPrompt')}
                </Text>
            )}

            <Box mb="md" w="100%">
                <RidesSearch />
            </Box>

            <Box>
                {loading ? (
                    <Center p="xl">
                        <Loader />
                    </Center>
                ) : (
                    <RideList
                        initialRides={rides}
                        searchParams={rideListSearchParams}
                    />
                )}
            </Box>

            {/* My Ride Requests Modal */}
            <Modal
                opened={myRequestsOpened}
                onClose={closeMyRequests}
                title={t('rides.rideRequests.myRequests')}
                size="lg"
            >
                {loadingRequests ? (
                    <Center p="xl">
                        <Loader />
                    </Center>
                ) : requests.length === 0 ? (
                    <Text c="dimmed" ta="center" py="xl">
                        {t('rides.rideRequests.noActiveRequests')}
                    </Text>
                ) : (
                    <Stack gap="md">
                        {requests.map((request) => (
                            <Card key={request.id} withBorder shadow="sm" radius="md" p="md">
                                <Stack gap="xs">
                                    <Group justify="space-between">
                                        <Text fw={600}>{request.from_text} → {request.to_text}</Text>
                                        <Badge color="blue">{request.status}</Badge>
                                    </Group>
                                    <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="xs">
                                        <Box>
                                            <Text size="xs" c="dimmed">{t('rides.rideRequests.preferredTime')}</Text>
                                            <Text size="sm">{dayjs(request.preferred_time).tz(CHICAGO_TZ).format('MMM D, h:mm A')}</Text>
                                        </Box>
                                        <Box>
                                            <Text size="xs" c="dimmed">{t('rides.rideRequests.flexibility')}</Text>
                                            <Text size="sm">{formatFlexibility(request.time_flexibility)}</Text>
                                        </Box>
                                        <Box>
                                            <Text size="xs" c="dimmed">{t('rides.rideRequests.seats')}</Text>
                                            <Text size="sm">{request.seats}</Text>
                                        </Box>
                                        <Box>
                                            <Text size="xs" c="dimmed">{t('rides.rideRequests.price')}</Text>
                                            <Text size="sm">{request.price != null ? `$${request.price}` : '-'}</Text>
                                        </Box>
                                        <Box>
                                            <Text size="xs" c="dimmed">{t('rides.rideRequests.expiresAt')}</Text>
                                            <Text size="sm">{dayjs(request.expires_at).tz(CHICAGO_TZ).format('MMM D, h:mm A')}</Text>
                                        </Box>
                                    </SimpleGrid>
                                    <Group gap="xs" mt="xs">
                                        <Button
                                            size="xs"
                                            variant="light"
                                            color="green"
                                            leftSection={<IconCheck size={14} />}
                                            loading={updatingRequest === request.id}
                                            onClick={() => updateRequestStatus(request.id, 'fulfilled')}
                                        >
                                            {t('rides.rideRequests.markFulfilled')}
                                        </Button>
                                        <Button
                                            size="xs"
                                            variant="light"
                                            color="red"
                                            leftSection={<IconTrash size={14} />}
                                            loading={updatingRequest === request.id}
                                            onClick={() => updateRequestStatus(request.id, 'deleted')}
                                        >
                                            {t('rides.rideRequests.delete')}
                                        </Button>
                                    </Group>
                                </Stack>
                            </Card>
                        ))}
                    </Stack>
                )}
            </Modal>

            {/* Post Ride Request Modal */}
            <Modal
                opened={postRequestOpened}
                onClose={closePostRequest}
                title={t('rides.rideRequests.postRequest')}
                size="lg"
            >
                <Stack gap="md">
                    <Autocomplete
                        label={t('rides.rideRequests.origin')}
                        placeholder={t('rides.search.startPlaceholder')}
                        data={originSuggestions}
                        value={origin}
                        onChange={(val) => {
                            setOrigin(val);
                            setOriginCoords(null);
                            setOriginPlaceId(null);
                            if (val === '') {
                                setOriginSuggestions(DEFAULT_AUTOCOMPLETE_LOCATIONS);
                            } else {
                                debounceFetch(val, setOriginSuggestions, setLoadingOrigin, originSessionToken.current);
                            }
                        }}
                        onFocus={() => {
                            if (!origin) setOriginSuggestions(DEFAULT_AUTOCOMPLETE_LOCATIONS);
                        }}
                        onOptionSubmit={async (val) => {
                            let pid = predictionsMap.current.get(val) || null;
                            if (!pid && DEFAULT_AUTOCOMPLETE_LOCATIONS.includes(val)) {
                                pid = await fetchPlaceIdFromQuery(val, originSessionToken.current);
                            }
                            setOriginPlaceId(pid);
                            if (pid) fetchPlaceDetails(pid, setOriginCoords);
                        }}
                        leftSection={<IconMapPin size={16} />}
                        rightSection={renderRightSection(loadingOrigin, origin, () => {
                            setOrigin('');
                            setOriginCoords(null);
                            setOriginPlaceId(null);
                        })}
                        required
                    />

                    <Autocomplete
                        label={t('rides.rideRequests.destination')}
                        placeholder={t('rides.search.endPlaceholder')}
                        data={destSuggestions}
                        value={destination}
                        onChange={(val) => {
                            setDestination(val);
                            setDestCoords(null);
                            setDestPlaceId(null);
                            if (val === '') {
                                setDestSuggestions(DEFAULT_AUTOCOMPLETE_LOCATIONS);
                            } else {
                                debounceFetch(val, setDestSuggestions, setLoadingDest, destSessionToken.current);
                            }
                        }}
                        onFocus={() => {
                            if (!destination) setDestSuggestions(DEFAULT_AUTOCOMPLETE_LOCATIONS);
                        }}
                        onOptionSubmit={async (val) => {
                            let pid = predictionsMap.current.get(val) || null;
                            if (!pid && DEFAULT_AUTOCOMPLETE_LOCATIONS.includes(val)) {
                                pid = await fetchPlaceIdFromQuery(val, destSessionToken.current);
                            }
                            setDestPlaceId(pid);
                            if (pid) fetchPlaceDetails(pid, setDestCoords);
                        }}
                        leftSection={<IconMapPin size={16} />}
                        rightSection={renderRightSection(loadingDest, destination, () => {
                            setDestination('');
                            setDestCoords(null);
                            setDestPlaceId(null);
                        })}
                        required
                    />

                    <Input.Wrapper label={t('rides.rideRequests.preferredTime')} required>
                        <Input
                            component="input"
                            type="datetime-local"
                            value={toDateTimeLocalString(preferredTime)}
                            onChange={(e) => {
                                const val = e.currentTarget.value;
                                setPreferredTime(val ? fromDateTimeLocalString(val) : null);
                            }}
                            min={toDateTimeLocalString(getChicagoNow())}
                        />
                    </Input.Wrapper>

                    <Select
                        label={t('rides.rideRequests.timeFlexibility')}
                        value={timeFlexibility}
                        onChange={setTimeFlexibility}
                        data={[
                            { value: '15 minutes', label: '± 15 minutes' },
                            { value: '30 minutes', label: '± 30 minutes' },
                            { value: '1 hour', label: '± 1 hour' },
                            { value: '2 hours', label: '± 2 hours' },
                            { value: '3 hours', label: '± 3 hours' },
                        ]}
                        required
                    />

                    <NumberInput
                        label={t('rides.rideRequests.seats')}
                        value={seats}
                        onChange={(val) => setSeats(val === '' ? '' : Number(val))}
                        min={1}
                        max={10}
                        required
                    />

                    <NumberInput
                        label={t('rides.rideRequests.price')}
                        description={t('rides.rideRequests.priceDesc')}
                        value={price}
                        onChange={(val) => setPrice(val === '' ? '' : Number(val))}
                        min={0}
                        prefix="$"
                    />

                    <Input.Wrapper label={t('rides.rideRequests.expiresAtLabel')}>
                        <Input
                            component="input"
                            type="datetime-local"
                            value={toDateTimeLocalString(expiresAt)}
                            onChange={(e) => {
                                const val = e.currentTarget.value;
                                setExpiresAt(val ? fromDateTimeLocalString(val) : null);
                            }}
                            min={toDateTimeLocalString(getChicagoNow())}
                        />
                    </Input.Wrapper>

                    <Button
                        onClick={handleSubmitRequest}
                        loading={submitting}
                        fullWidth
                    >
                        {t('rides.rideRequests.submit')}
                    </Button>
                </Stack>
            </Modal>
        </Container>
    );
}
