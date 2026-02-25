'use client'

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
    Container, Title, Text, Card, Group, Badge, Stack, Grid, LoadingOverlay, Alert, Divider, Avatar, ThemeIcon, Progress, Tooltip, SimpleGrid, Paper, Button, Popover, Transition, NumberInput, Modal, Select, TextInput, ActionIcon, Autocomplete, Textarea, Loader, Box, Image, Input
} from '@mantine/core';
import { toDateTimeLocalString, fromDateTimeLocalString } from '@/utils/dateUtils';
import { notifications } from '@mantine/notifications';
import { useAuth } from '@/components/firebase/AuthContext';
import { useMediaQuery, useIntersection, useInterval, useWindowEvent } from '@mantine/hooks';
import {
    IconMapPin, IconCalendar, IconArmchair, IconCoin, IconInfoCircle, IconLuggage, IconClock, IconCar, IconStar, IconCheck, IconUser, IconAlertCircle, IconDashboard, IconPhone, IconRefresh, IconX, IconShare, IconMessage
} from '@tabler/icons-react';
import { LocalizedLink } from '@/components/LocalizedLink';
import { BookingSuccessModal } from '@/components/BookingSuccessModal';
import { FuzzyRadiusMap } from '@/components/Rides/FuzzyRadiusMap';
import dayjs, { toChicagoISO, fromChicagoISO, getChicagoNow, CHICAGO_TZ } from '@/utils/dateUtils';
import { getBookingStatusConfig, getTripStatusConfig } from '@/utils/statusUtils';
import { useTranslation } from 'react-i18next';
import CarPicsDisplay from '@/components/CarPicsDisplay/CarPicsDisplay';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { useNotifications } from '@/components/Notifications/NotificationContext';


interface RideDetails {
    id: string;
    status: string;
    created_at: string;
    modified_at: string;
    from_text: string;
    origin?: {
        lat: number | null;
        lng: number | null;
        fuzzy_lat?: number | null;
        fuzzy_lng?: number | null;
        obfuscated_bounds?: { north: number, south: number, east: number, west: number } | null;
    };
    to_text: string;
    departure_time: string;
    price: string;
    access: {
        receipt: boolean;
        contact: boolean;
    };
    seats: {
        total: number;
        taken: number;
    };
    notes: string;
    car: {
        make: string;
        model: string;
        color: string;
        year: string;
        plate: string | null;
        pic1?: string | null;
        pic2?: string | null;
        pic3?: string | null;
        pic4?: string | null;
    } | null;
    driver: {
        id: string;
        name: string;
        verified: boolean;
        community_driver: boolean;
        photo_url: string | null;
        member_since: string;
        rating: number | null;
        completed_trips: number;
        phone: string | null;
    };
    rules: {
        luggage: {
            big: number;
            small: number;
            big_paid: number;
            small_paid: number;
            big_paid_price: number;
            small_paid_price: number;
        };
        pickup: {
            rules: string | null;
            radius: number;
            dropoff_radius: number;
        };
        flexibility: any;
        payment: {
            methods: string[];
            handle: string | null;
            qr_codes?: Record<string, string>;
        };
        auto_accept: boolean;
        cancellation_policy: string | null;
        cutoff_time: {
            days?: number;
            hours?: number;
            minutes?: number;
        } | null;
        pay_window: string | { hours?: number; minutes?: number; seconds?: number; days?: number } | null; // Can be interval object
    };
    user_booking_status: string | null;
}

export default function RidePage() {
    const params = useParams();
    const router = useRouter();
    const rideId = params.rideId as string;
    const { user, handleProtectedAction } = useAuth();
    const { t } = useTranslation('common');
    const { isIOS, isStandalone } = usePWAInstall();
    const { pushPermission } = useNotifications();
    const [ride, setRide] = useState<RideDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const isSmallScreen = useMediaQuery('(max-width: 500px)');
    const { ref, entry } = useIntersection({
        threshold: 0,
    });

    // Booking State
    const [bookingOpen, setBookingOpen] = useState(false);
    const [bookingSubmitting, setBookingSubmitting] = useState(false);
    const [bookingData, setBookingData] = useState<{
        seats: number;
        bigLuggage: number;
        smallLuggage: number;
        pickupTime: Date | null;
        intendedPaymentMethod: string;
        riderNote: string;
    }>({
        seats: 1,
        bigLuggage: 0,
        smallLuggage: 0,
        pickupTime: null,
        intendedPaymentMethod: '',
        riderNote: '',
    });

    const [bookingSuccessModalOpen, setBookingSuccessModalOpen] = useState(false);
    const [bookingSuccessStatus, setBookingSuccessStatus] = useState<string>('');
    const [bookingSuccessPaymentMethod, setBookingSuccessPaymentMethod] = useState<string>('');
    const [qrModalOpen, setQrModalOpen] = useState(false);
    const [qrModalData, setQrModalData] = useState<{ method: string; url: string } | null>(null);

    // Pickup Location Autocomplete State
    const [pickupLocation, setPickupLocation] = useState('');
    const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number } | null>(null);
    const [pickupSuggestions, setPickupSuggestions] = useState<string[]>([]);
    const [loadingPickup, setLoadingPickup] = useState(false);
    const [pickupError, setPickupError] = useState<string | null>(null);
    const pickupSessionToken = useRef<string>(typeof crypto !== 'undefined' ? crypto.randomUUID() : '');
    const pickupLastSelection = useRef<string>('');
    const pickupPredictionsMap = useRef<Map<string, string>>(new Map());
    const pickupDebounceTimeout = useRef<NodeJS.Timeout | null>(null);

    const fetchRide = async () => {
        if (!rideId) return;
        try {
            const token = user ? await user.getIdToken() : null;
            const headers: HeadersInit = {};
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const res = await fetch(`/api/trips/${rideId}`, {
                headers
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || 'Failed to fetch ride');
            }
            const data = await res.json();
            setRide(data);
        } catch (err: any) {
            console.error(err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const interval = useInterval(fetchRide, 30000); // 30 seconds

    // Revalidate on focus (for PWA / Tab switching)
    useWindowEvent('focus', () => {
        fetchRide();
    });

    useEffect(() => {
        fetchRide();
        interval.start();
        return interval.stop;
    }, [rideId, user]); // Refetch if user changes (auth loads)

    const memberSinceYear = ride ? dayjs(ride.driver.member_since).tz(CHICAGO_TZ).format('YYYY') : '';

    const isDriver = user && ride?.driver?.id === user.uid;

    const prefilledRef = useRef(false);

    useEffect(() => {
        if (!user || !ride || isDriver) return;

        const maxBig = ride.rules.luggage.big;
        const maxSmall = ride.rules.luggage.small;

        if (!prefilledRef.current) {
            const initializeBookingData = async () => {
                let profileDefaults: any = {};
                try {
                    const token = await user.getIdToken();
                    const res = await fetch(`/api/user/${user.uid}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (res.ok) {
                        const profile = await res.json();
                        profileDefaults = profile.rider_profile || {};
                    }
                } catch (e) {
                    console.error("Failed to fetch profile defaults", e);
                }

                setBookingData(prev => ({
                    ...prev,
                    bigLuggage: Math.min(profileDefaults.default_big_luggage || 0, maxBig + (ride.rules.luggage.big_paid || 0)),
                    smallLuggage: Math.min(profileDefaults.default_small_luggage || 0, maxSmall + (ride.rules.luggage.small_paid || 0)),
                    pickupTime: fromChicagoISO(ride.departure_time),
                    intendedPaymentMethod: (ride.rules.payment.methods && ride.rules.payment.methods.length > 0) ? '' : 'None'
                }));
                prefilledRef.current = true;
            };
            initializeBookingData();
        } else {
            // Re-clamp in case rules changed
            setBookingData(prev => ({
                ...prev,
                bigLuggage: Math.min(prev.bigLuggage, (maxBig + (ride.rules.luggage.big_paid || 0)) * prev.seats),
                smallLuggage: Math.min(prev.smallLuggage, (maxSmall + (ride.rules.luggage.small_paid || 0)) * prev.seats),
            }));
        }
    }, [user, ride, isDriver]);

    // --- Pickup Location Autocomplete Logic ---
    const fetchPickupPlaces = async (query: string) => {
        if (!query || query.length < 3) {
            setPickupSuggestions([]);
            return;
        }

        setLoadingPickup(true);
        try {
            const apiKey = process.env.NEXT_PUBLIC_PLACES_AUTOCOMPLETE!;
            const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': apiKey,
                },
                body: JSON.stringify({
                    input: query,
                    sessionToken: pickupSessionToken.current
                }),
            });

            if (!response.ok) {
                console.error("Places API error", await response.text());
                setLoadingPickup(false);
                return;
            }

            const data = await response.json();
            const newSuggestions: string[] = [];
            const seenTexts = new Set<string>();

            (data.suggestions || []).forEach((item: any) => {
                const text = item.placePrediction.text.text;
                const id = item.placePrediction.placeId;

                if (!seenTexts.has(text)) {
                    seenTexts.add(text);
                    newSuggestions.push(text);
                    pickupPredictionsMap.current.set(text, id);
                }
            });

            setPickupSuggestions(newSuggestions);
        } catch (error) {
            console.error("Failed to fetch places", error);
        } finally {
            setLoadingPickup(false);
        }
    };

    const debounceFetchPickup = (query: string) => {
        if (pickupDebounceTimeout.current) clearTimeout(pickupDebounceTimeout.current);
        pickupDebounceTimeout.current = setTimeout(() => {
            fetchPickupPlaces(query);
        }, 300);
    };

    const fetchPickupPlaceDetails = async (placeId: string) => {
        try {
            const apiKey = process.env.NEXT_PUBLIC_PLACES_AUTOCOMPLETE!;
            const response = await fetch(`https://places.googleapis.com/v1/places/${placeId}?fields=location,formattedAddress`, {
                headers: {
                    'X-Goog-Api-Key': apiKey,
                },
            });
            if (!response.ok) {
                console.error("Place details error", await response.text());
                return;
            }
            const data = await response.json();
            if (data.location) {
                setPickupCoords({ lat: data.location.latitude, lng: data.location.longitude });
            }
            // Update the display text to the formatted address if available
            if (data.formattedAddress) {
                setPickupLocation(data.formattedAddress);
                pickupLastSelection.current = data.formattedAddress;
            }
        } catch (error) {
            console.error("Failed to fetch place details", error);
        }
    };

    const handlePickupChange = (val: string) => {
        setPickupLocation(val);
        setPickupError(null);
        if (val !== pickupLastSelection.current) {
            pickupLastSelection.current = '';
            setPickupCoords(null);
        }
        if (!pickupSessionToken.current) pickupSessionToken.current = crypto.randomUUID();
        debounceFetchPickup(val);
    };

    const clearPickup = () => {
        setPickupLocation('');
        pickupLastSelection.current = '';
        setPickupCoords(null);
        setPickupSuggestions([]);
        setPickupError(null);
    };

    const handleBook = async () => {
        if (!user) {
            handleProtectedAction();
            return;
        }
        if (isDriver) {
            notifications.show({
                title: t('rides.detail.notifications.ownTripError.title'),
                message: t('rides.detail.notifications.ownTripError.message'),
                color: 'red'
            });
            return;
        }

        // Validate pickup location: if text entered, must have selected from autocomplete
        if (pickupLocation && !pickupCoords) {
            setPickupError(t('rides.detail.booking.invalidPickupLocation'));
            return;
        }

        setBookingSubmitting(true);
        try {
            // Construct preferred pickup time date object if time is set
            let preferredIso = null;
            if (bookingData.pickupTime) {
                preferredIso = toChicagoISO(bookingData.pickupTime);
            }

            const token = await user.getIdToken();
            const res = await fetch(`/api/trips/${rideId}/bookings`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    seats_booked: bookingData.seats,
                    big_luggage: bookingData.bigLuggage,
                    small_luggage: bookingData.smallLuggage,
                    preferred_pickup_time: preferredIso,
                    intended_payment_method: bookingData.intendedPaymentMethod,
                    pickup_location_text: pickupLocation || null,
                    pickup_lat: pickupCoords?.lat || null,
                    pickup_lng: pickupCoords?.lng || null,
                    rider_note: bookingData.riderNote || null
                })
            });

            const data = await res.json();
            if (!res.ok) {
                // Handle Profile Required Error
                if (res.status === 403 && data.code === 'PROFILE_REQUIRED') {
                    notifications.show({
                        title: t('rides.detail.notifications.profileRequired.title'),
                        message: t('rides.detail.notifications.profileRequired.message'),
                        color: 'blue'
                    });
                    const returnUrl = encodeURIComponent(`/rides/${rideId}`);
                    // localized path manual construction as router.push doesn't auto-localize
                    const lang = params.lang || 'en';
                    router.push(`/${lang}/complete-profile?returnUrl=${returnUrl}`);
                    return;
                }

                throw new Error(data.error || t('rides.detail.notifications.error.defaultMessage'));
            }

            // If status is 'joined_with_pay_window', we might want to show a modal or redirect.
            // For now, just close popover and maybe refresh or update local state
            setBookingOpen(false);

            // Store the selected payment method before modal opens
            setBookingSuccessPaymentMethod(bookingData.intendedPaymentMethod);
            setBookingSuccessStatus(data.status);
            setBookingSuccessModalOpen(true);

            // Refetch ride data to get updated permissions and payment info
            await fetchRide();

        } catch (err: any) {
            notifications.show({
                title: t('rides.detail.notifications.error.title'),
                message: err.message,
                color: 'red'
            });
        } finally {
            setBookingSubmitting(false);
        }
    };

    if (loading) return <LoadingOverlay visible />;
    if (error) return <Container py="xl"><Alert color="red" title={t('rides.detail.alerts.errorTitle')} icon={<IconInfoCircle />}>{error}</Alert></Container>;
    if (!ride) return <Container py="xl"><Alert color="yellow" title={t('rides.detail.alerts.notFoundTitle')} icon={<IconInfoCircle />}>{t('rides.detail.alerts.notFound')}</Alert></Container>;

    return (
        <Container size="md" py="xl" w="100%">
            <BookingSuccessModal
                opened={bookingSuccessModalOpen}
                onClose={() => setBookingSuccessModalOpen(false)}
                status={bookingSuccessStatus}
                payWindow={ride?.rules.pay_window || null}
                paymentHandle={ride?.rules.payment.handle || null}
                paymentQRCode={bookingSuccessPaymentMethod && ride?.rules.payment.qr_codes?.[bookingSuccessPaymentMethod] || null}
                selectedPaymentMethod={bookingSuccessPaymentMethod}
                totalPrice={(() => {
                    const basePrice = Number(ride?.price || 0) * bookingData.seats;
                    const freeBigLim = (ride?.rules.luggage.big || 0) * bookingData.seats;
                    const freeSmallLim = (ride?.rules.luggage.small || 0) * bookingData.seats;
                    const paidBig = Math.max(0, bookingData.bigLuggage - freeBigLim);
                    const paidSmall = Math.max(0, bookingData.smallLuggage - freeSmallLim);
                    const luggageFee = paidBig * (ride?.rules.luggage.big_paid_price || 0) + paidSmall * (ride?.rules.luggage.small_paid_price || 0);
                    return basePrice + luggageFee;
                })()}
            />
            <Modal
                opened={qrModalOpen}
                onClose={() => setQrModalOpen(false)}
                title={qrModalData?.method ? `${qrModalData.method} QR Code` : 'QR Code'}
                centered
                size="lg"
            >
                {qrModalData && (
                    <Image
                        src={qrModalData.url}
                        alt={`${qrModalData.method} QR Code`}
                        mah="70vh"
                        fit="contain"
                        radius="sm"
                    />
                )}
            </Modal>
            <Stack gap="xl">

                {/* Header Section */}
                <div>
                    <Group justify="space-between" align="start" mb="xs">
                        {ride.status === 'locked' ? (
                            <Badge size="lg" color="red">{t('rides.detail.header.bookingClosed')}</Badge>
                        ) : (
                            <Badge size="lg" color={getTripStatusConfig(ride.status).color}>
                                {t(getTripStatusConfig(ride.status).labelKey as any).toUpperCase()}
                            </Badge>
                        )}
                        <Group gap="xs">
                            <Text size="xs" c="dimmed">{t('rides.detail.header.posted', { time: dayjs(ride.created_at).fromNow() })}</Text>
                            <ActionIcon variant="transparent" color="gray" size="sm" onClick={fetchRide} loading={loading}>
                                <IconRefresh size={18} />
                            </ActionIcon>
                        </Group>
                    </Group>

                    <Group justify="space-between" align="end">
                        <Title order={2} style={{ lineHeight: 1.2 }}>
                            {ride.from_text} <Text span c="dimmed" inherit>→</Text> {ride.to_text}
                        </Title>


                    </Group>

                    <Group mt="xs" gap="lg">
                        <Group gap={6}>
                            <IconCalendar size={18} color="gray" />
                            <Text fw={500}>{dayjs(ride.departure_time).tz(CHICAGO_TZ).format('dddd, MMMM D, YYYY')}</Text>
                        </Group>
                        <Group gap={6}>
                            <IconClock size={18} color="gray" />
                            <Text fw={500}>
                                {dayjs(ride.departure_time).tz(CHICAGO_TZ).format('h:mm A')}
                                {ride.rules.flexibility && (
                                    <Text span size="sm" c="dimmed" ml={4}>
                                        {(() => {
                                            const f = ride.rules.flexibility;
                                            if (typeof f === 'object' && f !== null) {
                                                const h = f.hours || 0;
                                                const m = f.minutes || 0;
                                                if (h === 0 && m === 0) return t('rides.detail.time.exact');

                                                const parts = [];
                                                if (h > 0) parts.push(t('rides.detail.time.hours', { count: h }));
                                                if (m > 0) parts.push(t('rides.detail.time.minutes', { count: m }));
                                                return t('rides.detail.time.flexibility', { time: parts.join(' ') });
                                            }
                                            return '';
                                        })()}
                                    </Text>
                                )}
                            </Text>
                        </Group>
                    </Group>
                    {ride.rules.cutoff_time && ((ride.rules.cutoff_time.days ?? 0) > 0 || (ride.rules.cutoff_time.hours ?? 0) > 0 || (ride.rules.cutoff_time.minutes ?? 0) > 0) && (
                        <Group gap={6} mt={4}>
                            <IconAlertCircle size={18} color="orange" />
                            <Text size="sm" c="orange">
                                {t('rides.detail.time.bookingClosesIn', {
                                    time: (() => {
                                        const c = ride.rules.cutoff_time;
                                        const parts = [];
                                        if (c?.days) parts.push(t('rides.detail.time.days', { count: c.days }));
                                        if (c?.hours) parts.push(t('rides.detail.time.hours', { count: c.hours }));
                                        if (c?.minutes) parts.push(t('rides.detail.time.minutes', { count: c.minutes }));
                                        return parts.join(' ');
                                    })()
                                })}
                            </Text>
                        </Group>
                    )}
                </div>

                <Grid gutter="xl">
                    {/* LEFT COLUMN: Main Info */}
                    <Grid.Col span={{ base: 12, md: 8 }}>
                        <Stack gap="lg">

                            {/* Trip Summary Card */}
                            <Paper shadow="sm" radius="md" p="lg" withBorder>
                                <Group align="center" justify="space-between" mb="lg">
                                    <div>
                                        <Text size="3rem" fw={800} lh={1} c="blue">${ride.price}</Text>
                                        <Text size="sm" c="dimmed">{t('rides.detail.summary.perSeat')}</Text>
                                        {ride.user_booking_status && (
                                            <Text size="sm" fw={700} c="blue" mt={4}>
                                                {t('rides.detail.summary.status')}: {t(getBookingStatusConfig(ride.user_booking_status).labelKey as any).toUpperCase()}
                                            </Text>
                                        )}
                                        <Button
                                            ref={ref}
                                            mt="sm"
                                            size="sm"
                                            variant="light"
                                            color={isDriver ? 'blue' : (ride.status === 'bookable' || !!ride.user_booking_status) ? 'blue' : 'gray'}
                                            disabled={(() => {
                                                const isActiveBooking = !!ride.user_booking_status && !['removed', 'pay_timeout', 'left_paid', 'left_unpaid'].includes(ride.user_booking_status);
                                                return !isDriver && !isActiveBooking && ride.status !== 'bookable';
                                            })()}
                                            onClick={() => {
                                                if (!user) {
                                                    handleProtectedAction();
                                                    return;
                                                }
                                                if (isDriver) {
                                                    router.push(`/dashboard/${rideId}`);
                                                    return;
                                                }
                                                const status = ride.user_booking_status;

                                                // Active statuses: waiting_approval, joined_with_pay_window, confirmed, pending_payment...
                                                // Inactive statuses: removed, rejected, pay_timeout, left_paid, left_unpaid, cancelled.
                                                // logic: if active, goto dashboard. if inactive (except cancelled), open booking.

                                                const isInactive = ['removed', 'pay_timeout', 'left_paid', 'left_unpaid'].includes(status || '');

                                                if (status && !isInactive) {
                                                    router.push(`/dashboard/${rideId}`);
                                                    return;
                                                }
                                                setBookingOpen(true);
                                            }}
                                        >
                                            {user ? (
                                                isDriver ? t('rides.detail.buttons.manageTrip') :
                                                    (ride.user_booking_status === 'cancelled') ? t('rides.detail.buttons.bookingCancelled') :
                                                        (ride.status === 'locked' && !ride.user_booking_status) ? t('rides.detail.buttons.bookingClosed') :
                                                            ((ride.user_booking_status && !['removed', 'pay_timeout', 'left_paid', 'left_unpaid'].includes(ride.user_booking_status)) ? t('rides.detail.buttons.manageDashboard') : t('rides.detail.buttons.bookNow'))
                                            ) : ride.status === 'bookable' ? t('rides.detail.buttons.loginToBook') : t('rides.detail.buttons.cannotBook')}

                                        </Button>
                                        <Button
                                            mt="sm"
                                            size="sm"
                                            variant="subtle"
                                            color="gray"
                                            ml="xs"
                                            onClick={() => {
                                                const shareText = t('rides.errors.share.text', {
                                                    from: ride.from_text,
                                                    to: ride.to_text,
                                                    time: dayjs(ride.departure_time).tz(CHICAGO_TZ).format('MMM D, YYYY h:mm A'),
                                                    link: `${window.location.origin}/rides/${ride.id}`
                                                });
                                                navigator.clipboard.writeText(shareText);
                                                notifications.show({
                                                    title: t('rides.errors.successTitle'),
                                                    message: t('rides.errors.share.copied'),
                                                    color: 'green'
                                                });
                                            }}
                                        >
                                            <IconShare size={20} />
                                        </Button>
                                    </div>
                                    <div style={{ width: isSmallScreen ? '100%' : 140, marginTop: isSmallScreen ? 'var(--mantine-spacing-md)' : 0 }}>
                                        <Text size="sm" fw={500} mb={4} ta={isSmallScreen ? "left" : "right"}>
                                            {t('rides.detail.summary.seatsAvailable', { count: ride.seats.total - ride.seats.taken })}
                                        </Text>
                                        <Progress
                                            value={((ride.seats.total - ride.seats.taken) / ride.seats.total) * 100}
                                            size="lg"
                                            color={
                                                (ride.seats.total - ride.seats.taken) === ride.seats.total ? 'green' :
                                                    (ride.seats.total - ride.seats.taken) > 1 ? 'yellow' : 'red'
                                            }
                                            radius="xl"
                                        />
                                        <Text size="xs" c="dimmed" ta={isSmallScreen ? "left" : "right"} mt={2}>
                                            {t('rides.detail.summary.totalSeats', { count: ride.seats.total })}
                                        </Text>
                                    </div>
                                </Group>

                                <Text size="sm" c="dimmed" ta="center">{t('rides.detail.summary.paymentNote')}</Text>

                                {ride.notes && (
                                    <>
                                        <Divider my="md" label={t('rides.detail.summary.driversNote')} labelPosition="left" />
                                        <Text color="dimmed" style={{ whiteSpace: 'pre-wrap' }}>{ride.notes}</Text>
                                    </>
                                )}
                            </Paper>

                            {/* Driver Card */}
                            <Paper shadow="sm" radius="md" p="lg" withBorder>
                                <Title order={4} mb="md">{t('rides.detail.driver.title')}</Title>
                                <Group align="start">
                                    <LocalizedLink href={`/profile/${ride.driver.id}?role=driver`} style={{ textDecoration: 'none', color: 'inherit' }}>
                                        <Avatar src={ride.driver.photo_url} size="xl" radius="xl" color="initials">
                                            {ride.driver.name.substring(0, 2).toUpperCase()}
                                        </Avatar>
                                    </LocalizedLink>
                                    <div style={{ flex: 1 }}>
                                        <Group gap="xs" align="center">
                                            <LocalizedLink href={`/profile/${ride.driver.id}?role=driver`} style={{ textDecoration: 'none', color: 'inherit' }}>
                                                <Text fw={700} size="lg" style={{ cursor: 'pointer' }}>{ride.driver.name}</Text>
                                            </LocalizedLink>
                                            {ride.driver.verified && (
                                                <Badge color="green" leftSection={<IconCheck size={12} />}>{t('rides.detail.driver.verifiedStudent')}</Badge>
                                            )}
                                            {ride.driver.community_driver && (
                                                <Badge color="blue" leftSection={<IconCheck size={12} />}>{t('rides.detail.driver.communityDriver')}</Badge>
                                            )}
                                        </Group>
                                        <Text size="sm" c="dimmed">{t('rides.detail.driver.memberSince', { year: memberSinceYear })}</Text>

                                        {ride.access.contact ? (
                                            ride.driver.phone ? (
                                                <Group gap="xs" mt={4}>
                                                    <IconPhone size={16} color="gray" />
                                                    <Text size="sm">{ride.driver.phone}</Text>
                                                </Group>
                                            ) : (
                                                <Text size="sm" c="dimmed" fs="italic" mt={4}>{t('rides.detail.driver.phoneNotProvided')}</Text>
                                            )
                                        ) : (
                                            <Text size="sm" c="dimmed" fs="italic" mt={4}>
                                                {(() => {
                                                    if (!ride.user_booking_status) return t('rides.detail.driver.bookToView');
                                                    if (ride.user_booking_status === 'waiting_approval') return t('rides.detail.driver.hiddenUntilApproved');
                                                    if (['removed', 'rejected', 'pay_timeout', 'left_paid', 'left_unpaid'].includes(ride.user_booking_status)) return t('rides.detail.driver.bookingInactive');
                                                    if (['done', 'cancelled', 'aborted'].includes(ride.status)) return t('rides.detail.driver.contactExpired');
                                                    return t('rides.detail.driver.bookingNotActive');
                                                })()}
                                            </Text>
                                        )}

                                        <Group mt="sm" gap="xl">
                                            <div>
                                                <Group gap={4}>
                                                    <IconStar size={16} fill="orange" color="orange" />
                                                    <Text fw={600}>{ride.driver.rating?.toFixed(1) || t('common.new')}</Text>
                                                </Group>
                                                <Text size="xs" c="dimmed">{t('rides.detail.driver.rating')}</Text>
                                            </div>
                                            <div>
                                                <Text fw={600}>{ride.driver.completed_trips}</Text>
                                                <Text size="xs" c="dimmed">{t('rides.detail.driver.tripsCompleted')}</Text>
                                            </div>
                                        </Group>
                                        {user && !isDriver && (
                                            <Button
                                                mt="sm"
                                                variant="light"
                                                size="sm"
                                                leftSection={<IconMessage size={16} />}
                                                onClick={() => router.push(`/messages?userId=${ride.driver.id}`)}
                                            >
                                                {t('rides.detail.driver.messageDriver') || 'Message Driver'}
                                            </Button>
                                        )}
                                    </div>
                                </Group>
                            </Paper>

                            {/* Car Card */}
                            {ride.car && (
                                <Paper shadow="sm" radius="md" p="lg" withBorder>
                                    <Title order={4} mb="md">{t('rides.detail.vehicle.title')}</Title>
                                    <Group>
                                        {(ride.car.pic1 || ride.car.pic2 || ride.car.pic3 || ride.car.pic4) ? (
                                            <CarPicsDisplay pics={[ride.car.pic1, ride.car.pic2, ride.car.pic3, ride.car.pic4]} thumbnailHeight={64} thumbnailWidth={90} />
                                        ) : (
                                            <ThemeIcon variant="light" size={48} radius="md" color="gray">
                                                <IconCar size={28} />
                                            </ThemeIcon>
                                        )}
                                        <div>
                                            <Text fw={600} size="lg">{ride.car.year} {ride.car.make} {ride.car.model}</Text>
                                            <Badge color="gray" variant="outline">{ride.car.color}</Badge>

                                            {ride.access.receipt ? (
                                                ride.car.plate ? (
                                                    <Badge color="blue" variant="light" ml="xs">{ride.car.plate}</Badge>
                                                ) : (
                                                    <Badge color="gray" variant="light" ml="xs">
                                                        {['done', 'cancelled', 'aborted'].includes(ride.status)
                                                            ? t('rides.detail.vehicle.tripEnded')
                                                            : (ride.status === 'departed' ? t('rides.detail.vehicle.notProvided') : t('rides.detail.vehicle.visibleWhenDeparted'))}
                                                    </Badge>
                                                )
                                            ) : (
                                                <Badge color="gray" variant="light" ml="xs">
                                                    {['departed', 'done', 'cancelled', 'aborted'].includes(ride.status)
                                                        ? t('rides.detail.vehicle.hidden')
                                                        : t('rides.detail.vehicle.bookToView')}
                                                </Badge>
                                            )}
                                        </div>
                                    </Group>
                                    <Paper withBorder p="xs" radius="md" bg="gray.0" mt="md">
                                        <Group justify="center" gap="xs">
                                            <IconInfoCircle size={16} color="gray" />
                                            <Text size="xs" c="dimmed" ta="center">{t('rides.detail.vehicle.confirmedNote')}</Text>
                                        </Group>
                                    </Paper>
                                </Paper>
                            )}

                        </Stack>
                    </Grid.Col>

                    {/* RIGHT COLUMN: Rules & Details */}
                    <Grid.Col span={{ base: 12, md: 4 }}>
                        <Stack gap="md">
                            <Paper shadow="sm" radius="md" p="md" withBorder>
                                <Title order={5} mb="md">{t('rides.detail.rules.title')}</Title>
                                <Stack gap="sm">
                                    <Group justify="space-between">
                                        <Group gap="xs">
                                            <IconLuggage size={18} color="gray" />
                                            <Text size="sm">{t('rides.detail.rules.freeLuggage')}</Text>
                                        </Group>
                                        <div style={{ textAlign: 'right' }}>
                                            <Text size="sm" fw={500}>{ride.rules.luggage.big} {t('rides.detail.rules.big')}</Text>
                                            <Text size="sm" fw={500}>{ride.rules.luggage.small} {t('rides.detail.rules.small')}</Text>
                                        </div>
                                    </Group>

                                    {((ride.rules.luggage.big_paid || 0) > 0 || (ride.rules.luggage.small_paid || 0) > 0) && (
                                        <>
                                            <Divider />
                                            <Group justify="space-between">
                                                <Group gap="xs">
                                                    <IconCoin size={18} color="gray" />
                                                    <Text size="sm">{t('rides.detail.rules.paidLuggage')}</Text>
                                                </Group>
                                                <div style={{ textAlign: 'right' }}>
                                                    {(ride.rules.luggage.big_paid || 0) > 0 && (
                                                        <Text size="sm" fw={500}>{t('rides.detail.rules.paidBig', { count: ride.rules.luggage.big_paid, price: ride.rules.luggage.big_paid_price })}</Text>
                                                    )}
                                                    {(ride.rules.luggage.small_paid || 0) > 0 && (
                                                        <Text size="sm" fw={500}>{t('rides.detail.rules.paidSmall', { count: ride.rules.luggage.small_paid, price: ride.rules.luggage.small_paid_price })}</Text>
                                                    )}
                                                </div>
                                            </Group>
                                        </>
                                    )}

                                    <Divider />

                                    <div>
                                        <Group gap={4} mb={4}>
                                            <Text size="xs" c="dimmed">{t('rides.detail.rules.autoAccept')}</Text>
                                            <Popover width={220} position="bottom" withArrow shadow="md">
                                                <Popover.Target>
                                                    <ThemeIcon size="xs" variant="transparent" color="gray" style={{ cursor: 'pointer' }}>
                                                        <IconInfoCircle size={12} />
                                                    </ThemeIcon>
                                                </Popover.Target>
                                                <Popover.Dropdown>
                                                    <Text size="xs">{t('rides.detail.rules.autoAcceptTooltip')}</Text>
                                                </Popover.Dropdown>
                                            </Popover>
                                        </Group>
                                        {ride.rules.auto_accept ? (
                                            <Alert variant="light" color="green" py="xs" icon={<IconCheck size={16} />}>
                                                <Text size="sm">{t('rides.detail.rules.instantlyAccepted')}</Text>
                                            </Alert>
                                        ) : (
                                            <Alert variant="light" color="yellow" py="xs" icon={<IconClock size={16} />}>
                                                <Text size="sm">{t('rides.detail.rules.approvalRequired')}</Text>
                                            </Alert>
                                        )}
                                    </div>

                                    <Divider />

                                    <div>
                                        <Text size="xs" mb={4} >{t('rides.detail.rules.cancellationPolicy')}</Text>
                                        <Text size="sm" c={ride.rules.cancellation_policy ? undefined : "dimmed"}>{ride.rules.cancellation_policy || t('rides.detail.rules.cancellationDefault')}</Text>
                                    </div>

                                    <div>
                                        <Text size="xs" mb={4}>{t('rides.detail.rules.pickupInstructions')}</Text>
                                        <Text size="sm" fs={ride.rules.pickup.rules ? 'italic' : 'normal'} c={ride.rules.pickup.rules ? undefined : "dimmed"}>
                                            {ride.rules.pickup.rules ? `${ride.rules.pickup.rules}` : t('rides.detail.rules.noRestrictions')}
                                        </Text>
                                    </div>
                                </Stack>
                            </Paper>

                            <Paper shadow="sm" radius="md" p="md" withBorder>
                                <Title order={5} mb="sm">{t('rides.detail.payment.title')}</Title>
                                <Group gap="xs" style={{ flexWrap: 'wrap' }} mb="md">
                                    {ride.rules.payment.methods && ride.rules.payment.methods.length > 0 ? (
                                        ride.rules.payment.methods.map(method => (
                                            <Badge key={method} variant="dot" size="lg">{method}</Badge>
                                        ))
                                    ) : (
                                        <Text size="sm" c="dimmed">{t('rides.detail.payment.none')}</Text>
                                    )}
                                </Group>

                                <Divider mb="sm" />

                                <div>
                                    <Text size="xs" c="dimmed" mb={4}>{t('rides.detail.payment.handleLabel')}</Text>
                                    {ride.access.contact ? (
                                        <Text size="sm" c={ride.rules.payment.handle ? undefined : "dimmed"}>
                                            {ride.rules.payment.handle || t('rides.detail.payment.notProvided')}
                                        </Text>
                                    ) : (
                                        <Text size="sm" c="dimmed" fs="italic">
                                            {(() => {
                                                if (!ride.user_booking_status) return t('rides.detail.driver.bookToView');
                                                if (ride.user_booking_status === 'waiting_approval') return t('rides.detail.driver.hiddenUntilApproved');
                                                if (['removed', 'rejected', 'pay_timeout', 'left_paid', 'left_unpaid'].includes(ride.user_booking_status)) return t('rides.detail.driver.bookingInactive');
                                                if (['done', 'cancelled', 'aborted'].includes(ride.status)) return t('rides.detail.driver.contactExpired');
                                                return t('rides.detail.driver.bookingNotActive');
                                            })()}
                                        </Text>
                                    )}
                                </div>

                                {/* Payment QR Codes */}
                                {ride.access.contact && ride.rules.payment.qr_codes && Object.keys(ride.rules.payment.qr_codes).length > 0 && (
                                    <>
                                        <Divider my="sm" />
                                        <Text size="xs" c="dimmed" mb="xs">{t('rides.detail.payment.qrCodesLabel' as any)}</Text>
                                        <Stack gap="sm">
                                            {Object.entries(ride.rules.payment.qr_codes).map(([method, url]) => (
                                                <Paper
                                                    key={method}
                                                    p="xs"
                                                    withBorder
                                                    radius="sm"
                                                    w="100%"
                                                    style={{ cursor: 'pointer' }}
                                                    onClick={() => {
                                                        setQrModalData({ method, url: url as string });
                                                        setQrModalOpen(true);
                                                    }}
                                                >
                                                    <Text size="xs" fw={500} mb="xs">{method}</Text>
                                                    <Image
                                                        src={url as string}
                                                        alt={`${method} QR Code`}
                                                        w="100%"
                                                        h={50}
                                                        fit="contain"
                                                        radius="sm"
                                                    />
                                                    <Text size="xs" c="dimmed" ta="center" mt={4}>{t('common.clickToEnlarge' as any)}</Text>
                                                </Paper>
                                            ))}
                                        </Stack>
                                    </>
                                )}

                                <Text size="xs" c="dimmed" mt="md">
                                    {t('rides.detail.payment.disclaimer')}
                                </Text>
                            </Paper>
                        </Stack>
                    </Grid.Col>
                </Grid>

                {/* Safety Footer - Moved to bottom */}
                <Container size="sm" py="md">
                    <Stack gap={4} align="center">
                        <Text size="xs" c="dimmed" ta="center">{t('rides.detail.safety.disclaimer')}</Text>

                    </Stack>
                </Container>

                <Transition mounted={entry?.isIntersecting === false} transition="slide-up" duration={200} timingFunction="ease">
                    {(styles) => (
                        <Paper
                            style={{ ...styles, position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100, borderTop: '1px solid var(--mantine-color-gray-3)' }}
                            radius={0}
                            p="md"
                            shadow="xl"
                        >
                            <Container size="md">
                                <Group justify="space-between">
                                    <div>
                                        <Text size="xl" fw={800} lh={1} c="blue">${ride.price}</Text>
                                        <Text size="xs" c="dimmed">{t('rides.detail.summary.perSeat')}</Text>
                                        {ride.user_booking_status && (
                                            <Text size="xs" fw={700} c="blue" mt={2}>
                                                {t('rides.detail.summary.status')}: {t(getBookingStatusConfig(ride.user_booking_status).labelKey as any).toUpperCase()}
                                            </Text>
                                        )}
                                    </div>
                                    <Group gap="xs">
                                        <Button
                                            variant="subtle"
                                            color="gray"
                                            size="md"
                                            onClick={() => {
                                                const shareText = t('rides.errors.share.text', {
                                                    from: ride.from_text,
                                                    to: ride.to_text,
                                                    time: dayjs(ride.departure_time).tz(CHICAGO_TZ).format('MMM D, YYYY h:mm A'),
                                                    link: `${window.location.origin}/rides/${ride.id}`
                                                });
                                                navigator.clipboard.writeText(shareText);
                                                notifications.show({
                                                    title: t('rides.errors.successTitle'),
                                                    message: t('rides.errors.share.copied'),
                                                    color: 'green'
                                                });
                                            }}
                                        >
                                            <IconShare size={24} />
                                        </Button>
                                        <Button
                                            size="md"
                                            variant="filled"
                                            color={
                                                isDriver ? 'gray' :
                                                    ride.user_booking_status ? 'blue' :
                                                        ride.status === 'bookable' ? 'blue' : 'gray'
                                            }
                                            disabled={(() => {
                                                const isActiveBooking = !!ride.user_booking_status && !['removed', 'pay_timeout', 'left_paid', 'left_unpaid'].includes(ride.user_booking_status);
                                                return !isDriver && !isActiveBooking && ride.status !== 'bookable';
                                            })()}
                                            onClick={() => {
                                                if (!user) {
                                                    handleProtectedAction();
                                                    return;
                                                }
                                                if (isDriver) {
                                                    router.push(`/dashboard/${rideId}`);
                                                    return;
                                                }
                                                const status = ride.user_booking_status;
                                                const isInactive = ['removed', 'pay_timeout', 'left_paid', 'left_unpaid', 'cancelled'].includes(status || '');

                                                if (status && !isInactive) {
                                                    router.push(`/dashboard/${rideId}`);
                                                    return;
                                                }
                                                // window.scrollTo({ top: 0, behavior: 'smooth' });
                                                setBookingOpen(true);
                                            }}
                                        >
                                            {user ? (
                                                isDriver ? t('rides.detail.buttons.manageTrip') :
                                                    (ride.user_booking_status === 'cancelled') ? t('rides.detail.buttons.bookingCancelled') :
                                                        (ride.status === 'locked' && !ride.user_booking_status) ? t('rides.detail.buttons.bookingClosed') :
                                                            ((ride.user_booking_status && !['removed', 'pay_timeout', 'left_paid', 'left_unpaid'].includes(ride.user_booking_status)) ? t('rides.detail.buttons.manageDashboard') : t('rides.detail.buttons.bookNow'))
                                            ) :
                                                ride.status === 'bookable' ? t('rides.detail.buttons.loginToBook') : t('rides.detail.buttons.cannotBook')}

                                        </Button>
                                    </Group>
                                </Group>
                            </Container>
                        </Paper>
                    )}
                </Transition>

                <Modal opened={bookingOpen} onClose={() => setBookingOpen(false)} title={t('rides.detail.booking.modalTitle')} centered>
                    <Stack gap="sm">
                        <NumberInput
                            label={t('rides.detail.booking.seats')}
                            description={t('rides.detail.booking.maxSeats', { count: ride.seats.total - ride.seats.taken })}
                            min={1}
                            max={ride.seats.total - ride.seats.taken}
                            value={bookingData.seats}
                            onChange={(v) => setBookingData({ ...bookingData, seats: Number(v) })}
                            required
                        />

                        <Group grow>
                            <NumberInput
                                label={t('rides.detail.booking.bigLuggage')}
                                min={0}
                                max={((ride.rules.luggage.big || 0) + (ride.rules.luggage.big_paid || 0)) * bookingData.seats}
                                value={bookingData.bigLuggage}
                                onChange={(v) => setBookingData({ ...bookingData, bigLuggage: Number(v) })}
                                description={
                                    (ride.rules.luggage.big_paid || 0) > 0
                                        ? `${t('tripDetails.rider.labels.freeLimit')}: ${ride.rules.luggage.big} ${t('tripDetails.rider.labels.perPerson')}. ${t('tripDetails.rider.labels.extraBag')}: $${ride.rules.luggage.big_paid_price || 0} ${t('tripDetails.rider.labels.each')}`
                                        : t('rides.detail.booking.maxLuggage', { count: ride.rules.luggage.big * bookingData.seats })
                                }
                            />
                            <NumberInput
                                label={t('rides.detail.booking.smallLuggage')}
                                min={0}
                                max={((ride.rules.luggage.small || 0) + (ride.rules.luggage.small_paid || 0)) * bookingData.seats}
                                value={bookingData.smallLuggage}
                                onChange={(v) => setBookingData({ ...bookingData, smallLuggage: Number(v) })}
                                description={
                                    (ride.rules.luggage.small_paid || 0) > 0
                                        ? `${t('tripDetails.rider.labels.freeLimit')}: ${ride.rules.luggage.small} ${t('tripDetails.rider.labels.perPerson')}. ${t('tripDetails.rider.labels.extraBag')}: $${ride.rules.luggage.small_paid_price || 0} ${t('tripDetails.rider.labels.each')}`
                                        : t('rides.detail.booking.maxLuggage', { count: ride.rules.luggage.small * bookingData.seats })
                                }
                            />
                        </Group>

                        {(() => {
                            const freeBigLim = (ride.rules.luggage.big || 0) * bookingData.seats;
                            const freeSmallLim = (ride.rules.luggage.small || 0) * bookingData.seats;
                            const paidBig = Math.max(0, bookingData.bigLuggage - freeBigLim);
                            const paidSmall = Math.max(0, bookingData.smallLuggage - freeSmallLim);
                            const bigCost = paidBig * (ride.rules.luggage.big_paid_price || 0);
                            const smallCost = paidSmall * (ride.rules.luggage.small_paid_price || 0);
                            const totalCost = bigCost + smallCost;
                            if (totalCost > 0) {
                                return (
                                    <Text size="xs" c="orange" fw={500}>
                                        {t('tripDetails.rider.labels.extraLuggageCost')}: ${totalCost.toFixed(2)}
                                        {paidBig > 0 && ` (${paidBig} ${t('dashboard.common.big')} × $${Number(ride.rules.luggage.big_paid_price || 0)})`}
                                        {paidSmall > 0 && ` (${paidSmall} ${t('dashboard.common.small')} × $${Number(ride.rules.luggage.small_paid_price || 0)})`}
                                    </Text>
                                );
                            }
                            return null;
                        })()}

                        {/* Payment Method Selection */}
                        {ride.rules.payment.methods && ride.rules.payment.methods.length > 0 ? (
                            <Select
                                label={t('rides.detail.booking.intendedPayment')}
                                placeholder={t('rides.detail.booking.selectPayment')}
                                data={ride.rules.payment.methods}
                                value={bookingData.intendedPaymentMethod}
                                onChange={(value) => setBookingData({ ...bookingData, intendedPaymentMethod: value || '' })}
                                required
                                allowDeselect={false}
                            />
                        ) : (
                            <TextInput
                                label={t('rides.detail.booking.intendedPayment')}
                                value={t('rides.detail.payment.none')}
                                disabled
                                description={t('rides.detail.booking.noPaymentMethods')}
                            />
                        )}

                        {/* Preferred Pickup Location */}
                        <Autocomplete
                            label={t('rides.detail.booking.preferredPickupLocation')}
                            description={t('rides.detail.booking.preferredPickupLocationDesc')}
                            placeholder={t('rides.detail.booking.pickupLocationPlaceholder')}
                            data={pickupSuggestions}
                            value={pickupLocation}
                            onChange={handlePickupChange}
                            onOptionSubmit={(val) => {
                                pickupLastSelection.current = val;
                                const pid = pickupPredictionsMap.current.get(val) || null;
                                if (pid) fetchPickupPlaceDetails(pid);
                            }}
                            leftSection={<IconMapPin size={16} />}
                            rightSection={
                                loadingPickup ? (
                                    <Loader size="xs" />
                                ) : pickupLocation ? (
                                    <ActionIcon variant="transparent" color="gray" onClick={clearPickup}>
                                        <IconX size={16} />
                                    </ActionIcon>
                                ) : null
                            }
                            error={pickupError}
                        />
                        {ride.origin?.obfuscated_bounds && (
                            <Box mt="xs">
                                <FuzzyRadiusMap
                                    bounds={ride.origin.obfuscated_bounds}
                                    userLocation={pickupCoords || undefined}
                                    type='pickup'
                                />
                            </Box>
                        )}

                        {/* Rider Note */}
                        <Textarea
                            label={t('rides.detail.booking.riderNote')}
                            description={t('rides.detail.booking.riderNoteDesc')}
                            placeholder={t('rides.detail.booking.riderNotePlaceholder')}
                            value={bookingData.riderNote}
                            onChange={(e) => setBookingData({ ...bookingData, riderNote: e.currentTarget.value })}
                            minRows={2}
                            maxRows={4}
                            autosize
                        />

                        <Group justify="space-between" mb={0} pb={0}>
                            <Text size="sm" fw={500}>{t('rides.detail.booking.preferredPickup')}</Text>
                            <Button
                                variant="transparent"
                                size="compact-xs"
                                style={{ fontSize: 11, height: 'auto' }}
                                onClick={() => setBookingData(prev => ({ ...prev, pickupTime: fromChicagoISO(ride.departure_time) }))}
                            >
                                {t('rides.detail.booking.resetToDeparture')}
                            </Button>
                        </Group>
                        <Input.Wrapper
                            description={(() => {
                                const f = ride.rules.flexibility;
                                if (typeof f === 'object' && f !== null) {
                                    const h = f.hours || 0;
                                    const m = f.minutes || 0;
                                    if (h === 0 && m === 0) return t('rides.detail.booking.exactTimeOnly');

                                    const parts = [];
                                    if (h > 0) parts.push(t('rides.detail.time.hours', { count: h }));
                                    if (m > 0) parts.push(t('rides.detail.time.minutes', { count: m }));
                                    return t('rides.detail.booking.flexibilityLabel', { time: parts.join(' ') });
                                }
                                return t('rides.detail.booking.optional');
                            })()}
                        >
                            <Input
                                component="input"
                                type="datetime-local"
                                value={toDateTimeLocalString(bookingData.pickupTime)}
                                onChange={(e) => {
                                    const val = e.currentTarget.value;
                                    setBookingData({ ...bookingData, pickupTime: val ? fromDateTimeLocalString(val) : null });
                                }}
                                leftSection={<IconClock size={16} />}
                                rightSection={
                                    bookingData.pickupTime ? (
                                        <ActionIcon variant="transparent" color="gray" onClick={() => setBookingData(prev => ({ ...prev, pickupTime: null }))}>
                                            <IconX size={16} />
                                        </ActionIcon>
                                    ) : null
                                }
                                rightSectionPointerEvents="all"
                                min={toDateTimeLocalString(getChicagoNow())}
                            />
                        </Input.Wrapper>

                        <Button
                            fullWidth
                            onClick={handleBook}
                            loading={bookingSubmitting}
                            disabled={ride.rules.payment.methods && ride.rules.payment.methods.length > 0 && !bookingData.intendedPaymentMethod}
                        >
                            {t('rides.detail.booking.confirmBooking')}
                        </Button>
                    </Stack>
                </Modal>

            </Stack>
        </Container >
    );
}