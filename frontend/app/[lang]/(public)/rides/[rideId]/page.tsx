'use client'

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
    Container, Title, Text, Card, Group, Badge, Stack, Grid, LoadingOverlay, Alert, Divider, Avatar, ThemeIcon, Progress, Tooltip, SimpleGrid, Paper, Button, Popover, Transition, NumberInput, Modal, Select, TextInput
} from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { useAuth } from '@/components/firebase/AuthContext';
import { useMediaQuery, useIntersection, useInterval } from '@mantine/hooks';
import {
    IconMapPin, IconCalendar, IconArmchair, IconCoin, IconInfoCircle, IconLuggage, IconClock, IconCar, IconStar, IconCheck, IconUser, IconAlertCircle, IconDashboard, IconPhone
} from '@tabler/icons-react';
import { LocalizedLink } from '@/components/LocalizedLink';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { getBookingStatusConfig, getTripStatusConfig } from '@/utils/statusUtils';

dayjs.extend(relativeTime);


interface RideDetails {
    id: string;
    status: string;
    created_at: string;
    modified_at: string;
    from_text: string;
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
    } | null;
    driver: {
        id: string;
        name: string;
        verified: boolean;
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
        };
        auto_accept: boolean;
        cancellation_policy: string | null;
        cutoff_time: {
            days?: number;
            hours?: number;
            minutes?: number;
        } | null;
    };
    user_booking_status: string | null;
}

export default function RidePage() {
    const params = useParams();
    const router = useRouter();
    const rideId = params.rideId as string;
    const { user, handleProtectedAction } = useAuth();
    const [ride, setRide] = useState<RideDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const isSmallScreen = useMediaQuery('(max-width: 400px)');
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
    }>({
        seats: 1,
        bigLuggage: 0,
        smallLuggage: 0,
        pickupTime: null,
        intendedPaymentMethod: '',
    });

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

    const interval = useInterval(fetchRide, 120000);

    useEffect(() => {
        fetchRide();
        interval.start();
        return interval.stop;
    }, [rideId, user]); // Refetch if user changes (auth loads)

    const memberSinceYear = ride ? dayjs(ride.driver.member_since).format('YYYY') : '';

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
                    bigLuggage: Math.min(profileDefaults.default_big_luggage || 0, maxBig),
                    smallLuggage: Math.min(profileDefaults.default_small_luggage || 0, maxSmall),
                    pickupTime: new Date(ride.departure_time),
                    intendedPaymentMethod: (ride.rules.payment.methods && ride.rules.payment.methods.length > 0) ? '' : 'None'
                }));
                prefilledRef.current = true;
            };
            initializeBookingData();
        } else {
            // Re-clamp in case rules changed
            setBookingData(prev => ({
                ...prev,
                bigLuggage: Math.min(prev.bigLuggage, maxBig),
                smallLuggage: Math.min(prev.smallLuggage, maxSmall),
            }));
        }
    }, [user, ride, isDriver]);

    const handleBook = async () => {
        if (!user) {
            handleProtectedAction();
            return;
        }
        if (isDriver) {
            notifications.show({
                title: 'Error',
                message: 'You cannot book your own trip.',
                color: 'red'
            });
            return;
        }

        setBookingSubmitting(true);
        try {
            // Construct preferred pickup time date object if time is set
            let preferredIso = null;
            if (bookingData.pickupTime) {
                preferredIso = bookingData.pickupTime.toISOString();
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
                    intended_payment_method: bookingData.intendedPaymentMethod
                })
            });

            const data = await res.json();
            if (!res.ok) {
                // Handle Profile Required Error
                if (res.status === 403 && data.code === 'PROFILE_REQUIRED') {
                    notifications.show({
                        title: 'Profile Required',
                        message: 'You need to complete your profile before booking.',
                        color: 'blue'
                    });
                    const returnUrl = encodeURIComponent(`/rides/${rideId}`);
                    // localized path manual construction as router.push doesn't auto-localize
                    const lang = params.lang || 'en';
                    router.push(`/${lang}/complete-profile?returnUrl=${returnUrl}`);
                    return;
                }

                throw new Error(data.error || 'Failed to book');
            }

            // If status is 'joined_with_pay_window', we might want to show a modal or redirect.
            // For now, just close popover and maybe refresh or update local state
            setBookingOpen(false);
            // Ideally trigger a re-fetch or optimistically update
            // For this task, we'll just alert success as per prompt "display error ... otherwise form". 
            // The prompt didn't specify post-success navigation, but "pay window" implies something.
            // I'll show a persistent notification or alert for pay window if that status comes back.
            if (data.status === 'joined_with_pay_window') {
                notifications.show({
                    title: 'Booking Accepted',
                    message: 'Please arrange payment with the driver.',
                    color: 'blue',
                    autoClose: false
                });
            } else {
                notifications.show({
                    title: 'Success',
                    message: data.status === 'ordered_with_pay_window' ? 'Booking initiated! Proceeding to payment...' : 'Booking request sent! Waiting for approval.', // prompt said 'joined with pay window', handling generalized success msg
                    color: 'green'
                });
            }

            // Update local state to reflect booking immediately
            setRide((prev) => {
                if (!prev) return null;
                const newTaken = data.status === 'joined_with_pay_window'
                    ? prev.seats.taken + bookingData.seats
                    : prev.seats.taken;

                return {
                    ...prev,
                    user_booking_status: data.status,
                    seats: {
                        ...prev.seats,
                        taken: newTaken
                    }
                };
            });

        } catch (err: any) {
            notifications.show({
                title: 'Error',
                message: err.message,
                color: 'red'
            });
        } finally {
            setBookingSubmitting(false);
        }
    };

    if (loading) return <LoadingOverlay visible />;
    if (error) return <Container py="xl"><Alert color="red" title="Error" icon={<IconInfoCircle />}>{error}</Alert></Container>;
    if (!ride) return <Container py="xl"><Alert color="yellow" title="Not Found" icon={<IconInfoCircle />}>Ride not found</Alert></Container>;

    return (
        <Container size="md" py="xl" w="100%">
            <Stack gap="xl">

                {/* Header Section */}
                <div>
                    <Group justify="space-between" align="start" mb="xs">
                        {ride.status === 'locked' ? (
                            <Badge size="lg" color="red">BOOKING CLOSED</Badge>
                        ) : (
                            <Badge size="lg" color={getTripStatusConfig(ride.status).color}>
                                {getTripStatusConfig(ride.status).label.toUpperCase()}
                            </Badge>
                        )}
                        <Text size="xs" c="dimmed">Posted {dayjs(ride.created_at).fromNow()}</Text>
                    </Group>

                    <Group justify="space-between" align="end">
                        <Title order={2} style={{ lineHeight: 1.2 }}>
                            {ride.from_text} <Text span c="dimmed" inherit>→</Text> {ride.to_text}
                        </Title>


                    </Group>

                    <Group mt="xs" gap="lg">
                        <Group gap={6}>
                            <IconCalendar size={18} color="gray" />
                            <Text fw={500}>{dayjs(ride.departure_time).format('dddd, MMMM D, YYYY')}</Text>
                        </Group>
                        <Group gap={6}>
                            <IconClock size={18} color="gray" />
                            <Text fw={500}>
                                {dayjs(ride.departure_time).format('h:mm A')}
                                {ride.rules.flexibility && (
                                    <Text span size="sm" c="dimmed" ml={4}>
                                        {(() => {
                                            const f = ride.rules.flexibility;
                                            if (typeof f === 'object' && f !== null) {
                                                const h = f.hours || 0;
                                                const m = f.minutes || 0;
                                                if (h === 0 && m === 0) return '(Exact time)';

                                                const parts = [];
                                                if (h > 0) parts.push(`${h} hr${h > 1 ? 's' : ''}`);
                                                if (m > 0) parts.push(`${m} min${m > 1 ? 's' : ''}`);
                                                return `(+/- ${parts.join(' ')})`;
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
                                Booking closes {(() => {
                                    const c = ride.rules.cutoff_time;
                                    const parts = [];
                                    if (c?.days) parts.push(`${c.days} day${c.days > 1 ? 's' : ''}`);
                                    if (c?.hours) parts.push(`${c.hours} hr${c.hours > 1 ? 's' : ''}`);
                                    if (c?.minutes) parts.push(`${c.minutes} min${c.minutes > 1 ? 's' : ''}`);
                                    return parts.join(' ');
                                })()} before departure
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
                                        <Text size="sm" c="dimmed">per seat</Text>
                                        {ride.user_booking_status && (
                                            <Text size="sm" fw={700} c="blue" mt={4}>
                                                Status: {getBookingStatusConfig(ride.user_booking_status).label.toUpperCase()}
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
                                                isDriver ? 'Manage Trip' :
                                                    (ride.user_booking_status === 'cancelled') ? 'Booking Cancelled' :
                                                        (ride.status === 'locked' && !ride.user_booking_status) ? 'Booking Closed' :
                                                            ((ride.user_booking_status && !['removed', 'pay_timeout', 'left_paid', 'left_unpaid'].includes(ride.user_booking_status)) ? 'Manage in Dashboard' : 'Book Now')
                                            ) : ride.status === 'bookable' ? 'Login to Book' : 'Trip cannot be booked'}

                                        </Button>
                                    </div>
                                    <div style={{ width: isSmallScreen ? '100%' : 140, marginTop: isSmallScreen ? 'var(--mantine-spacing-md)' : 0 }}>
                                        <Text size="sm" fw={500} mb={4} ta={isSmallScreen ? "left" : "right"}>
                                            {ride.seats.total - ride.seats.taken} seats available
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
                                            Total seats: {ride.seats.total}
                                        </Text>
                                    </div>
                                </Group>

                                <Text size="sm" c="dimmed" ta="center">Payment handled directly with driver</Text>

                                {ride.notes && (
                                    <>
                                        <Divider my="md" label="Driver's Note" labelPosition="left" />
                                        <Text color="dimmed" style={{ whiteSpace: 'pre-wrap' }}>{ride.notes}</Text>
                                    </>
                                )}
                            </Paper>

                            {/* Driver Card */}
                            <Paper shadow="sm" radius="md" p="lg" withBorder>
                                <Title order={4} mb="md">Your Driver</Title>
                                <Group align="start">
                                    <Avatar src={ride.driver.photo_url} size="xl" radius="xl" color="initials">
                                        {ride.driver.name.substring(0, 2).toUpperCase()}
                                    </Avatar>
                                    <div style={{ flex: 1 }}>
                                        <Group gap="xs" align="center">
                                            <Text fw={700} size="lg">{ride.driver.name}</Text>
                                            {ride.driver.verified && (
                                                <Badge color="green" leftSection={<IconCheck size={12} />}>Verified Student</Badge>
                                            )}
                                        </Group>
                                        <Text size="sm" c="dimmed">Member since {memberSinceYear}</Text>

                                        {ride.access.contact ? (
                                            ride.driver.phone ? (
                                                <Group gap="xs" mt={4}>
                                                    <IconPhone size={16} color="gray" />
                                                    <Text size="sm">{ride.driver.phone}</Text>
                                                </Group>
                                            ) : (
                                                <Text size="sm" c="dimmed" fs="italic" mt={4}>Not provided by driver</Text>
                                            )
                                        ) : (
                                            <Text size="sm" c="dimmed" fs="italic" mt={4}>
                                                {(() => {
                                                    if (!ride.user_booking_status) return 'Book ride to view';
                                                    if (ride.user_booking_status === 'waiting_approval') return 'Contact hidden until approved';
                                                    if (['removed', 'rejected', 'pay_timeout', 'left_paid', 'left_unpaid'].includes(ride.user_booking_status)) return 'Booking no longer active';
                                                    if (['done', 'cancelled', 'aborted'].includes(ride.status)) return 'Contact info expired';
                                                    return 'Booking not active';
                                                })()}
                                            </Text>
                                        )}

                                        <Group mt="sm" gap="xl">
                                            <div>
                                                <Group gap={4}>
                                                    <IconStar size={16} fill="orange" color="orange" />
                                                    <Text fw={600}>{ride.driver.rating?.toFixed(1) || 'New'}</Text>
                                                </Group>
                                                <Text size="xs" c="dimmed">Rating</Text>
                                            </div>
                                            <div>
                                                <Text fw={600}>{ride.driver.completed_trips}</Text>
                                                <Text size="xs" c="dimmed">Trips Completed</Text>
                                            </div>
                                        </Group>
                                    </div>
                                </Group>
                            </Paper>

                            {/* Car Card */}
                            {ride.car && (
                                <Paper shadow="sm" radius="md" p="lg" withBorder>
                                    <Title order={4} mb="md">Vehicle</Title>
                                    <Group>
                                        <ThemeIcon variant="light" size={48} radius="md" color="gray">
                                            <IconCar size={28} />
                                        </ThemeIcon>
                                        <div>
                                            <Text fw={600} size="lg">{ride.car.year} {ride.car.make} {ride.car.model}</Text>
                                            <Badge color="gray" variant="outline">{ride.car.color}</Badge>

                                            {ride.access.receipt ? (
                                                ride.car.plate ? (
                                                    <Badge color="blue" variant="light" ml="xs">{ride.car.plate}</Badge>
                                                ) : (
                                                    <Badge color="gray" variant="light" ml="xs">
                                                        {['done', 'cancelled', 'aborted'].includes(ride.status)
                                                            ? 'Trip Ended'
                                                            : (ride.status === 'departed' ? 'Not provided' : 'Visible when departed')}
                                                    </Badge>
                                                )
                                            ) : (
                                                <Badge color="gray" variant="light" ml="xs">
                                                    {['departed', 'done', 'cancelled', 'aborted'].includes(ride.status)
                                                        ? 'Hidden'
                                                        : 'Book to view'}
                                                </Badge>
                                            )}
                                        </div>
                                    </Group>
                                    <Paper withBorder p="xs" radius="md" bg="gray.0" mt="md">
                                        <Group justify="center" gap="xs">
                                            <IconInfoCircle size={16} color="gray" />
                                            <Text size="xs" c="dimmed" ta="center">Vehicle details confirmed by driver before departure.</Text>
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
                                <Title order={5} mb="md">Trip Rules</Title>
                                <Stack gap="sm">
                                    <Group justify="space-between">
                                        <Group gap="xs">
                                            <IconLuggage size={18} color="gray" />
                                            <Text size="sm">Luggage</Text>
                                        </Group>
                                        <div style={{ textAlign: 'right' }}>
                                            <Text size="sm" fw={500}>{ride.rules.luggage.big} Big</Text>
                                            <Text size="sm" fw={500}>{ride.rules.luggage.small} Small</Text>
                                        </div>
                                    </Group>

                                    <Divider />

                                    <div>
                                        <Group gap={4} mb={4}>
                                            <Text size="xs" c="dimmed">Auto-Accept</Text>
                                            <Popover width={220} position="bottom" withArrow shadow="md">
                                                <Popover.Target>
                                                    <ThemeIcon size="xs" variant="transparent" color="gray" style={{ cursor: 'pointer' }}>
                                                        <IconInfoCircle size={12} />
                                                    </ThemeIcon>
                                                </Popover.Target>
                                                <Popover.Dropdown>
                                                    <Text size="xs">If auto-accept is on, you will instantly move on to payment step upon booking. If it's off, you will need to wait for driver's manual approval to continue payment step.</Text>
                                                </Popover.Dropdown>
                                            </Popover>
                                        </Group>
                                        {ride.rules.auto_accept ? (
                                            <Alert variant="light" color="green" py="xs" icon={<IconCheck size={16} />}>
                                                <Text size="sm">Bookings are instantly accepted</Text>
                                            </Alert>
                                        ) : (
                                            <Alert variant="light" color="yellow" py="xs" icon={<IconClock size={16} />}>
                                                <Text size="sm">Driver approval required</Text>
                                            </Alert>
                                        )}
                                    </div>

                                    <Divider />

                                    <div>
                                        <Text size="xs" mb={4} >Cancellation Policy</Text>
                                        <Text size="sm" c={ride.rules.cancellation_policy ? undefined : "dimmed"}>{ride.rules.cancellation_policy || 'Cancellation policy will be communicated by the driver before departure.'}</Text>
                                    </div>

                                    <div>
                                        <Text size="xs" mb={4}>Pickup Instructions</Text>
                                        <Text size="sm" fs={ride.rules.pickup.rules ? 'italic' : 'normal'} c={ride.rules.pickup.rules ? undefined : "dimmed"}>
                                            {ride.rules.pickup.rules ? `${ride.rules.pickup.rules}` : 'No special restrictions'}
                                        </Text>
                                    </div>
                                </Stack>
                            </Paper>

                            <Paper shadow="sm" radius="md" p="md" withBorder>
                                <Title order={5} mb="sm">Payment Methods</Title>
                                <Group gap="xs" style={{ flexWrap: 'wrap' }} mb="md">
                                    {ride.rules.payment.methods && ride.rules.payment.methods.length > 0 ? (
                                        ride.rules.payment.methods.map(method => (
                                            <Badge key={method} variant="dot" size="lg">{method}</Badge>
                                        ))
                                    ) : (
                                        <Text size="sm" c="dimmed">None</Text>
                                    )}
                                </Group>

                                <Divider mb="sm" />

                                <div>
                                    <Text size="xs" c="dimmed" mb={4}>Payment handle / contact</Text>
                                    {ride.access.contact ? (
                                        <Text size="sm" c={ride.rules.payment.handle ? undefined : "dimmed"}>
                                            {ride.rules.payment.handle || 'Not provided by driver'}
                                        </Text>
                                    ) : (
                                        <Text size="sm" c="dimmed" fs="italic">
                                            {(() => {
                                                if (!ride.user_booking_status) return 'Book ride to view';
                                                if (ride.user_booking_status === 'waiting_approval') return 'Contact hidden until approved';
                                                if (['removed', 'rejected', 'pay_timeout', 'left_paid', 'left_unpaid'].includes(ride.user_booking_status)) return 'Booking no longer active';
                                                if (['done', 'cancelled', 'aborted'].includes(ride.status)) return 'Contact info expired';
                                                return 'Booking not active';
                                            })()}
                                        </Text>
                                    )}
                                </div>

                                <Text size="xs" c="dimmed" mt="md">
                                    RideList does not process payments.
                                </Text>
                            </Paper>
                        </Stack>
                    </Grid.Col>
                </Grid>

                {/* Safety Footer - Moved to bottom */}
                <Container size="sm" py="md">
                    <Stack gap={4} align="center">
                        <Text size="xs" c="dimmed" ta="center">RideList does not employ drivers. Always meet in public places and confirm details with the driver.</Text>

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
                                        <Text size="xs" c="dimmed">per seat</Text>
                                        {ride.user_booking_status && (
                                            <Text size="xs" fw={700} c="blue" mt={2}>
                                                Status: {getBookingStatusConfig(ride.user_booking_status).label.toUpperCase()}
                                            </Text>
                                        )}
                                    </div>
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
                                            isDriver ? 'Manage Trip' :
                                                (ride.user_booking_status === 'cancelled') ? 'Booking Cancelled' :
                                                    (ride.status === 'locked' && !ride.user_booking_status) ? 'Booking Closed' :
                                                        ((ride.user_booking_status && !['removed', 'pay_timeout', 'left_paid', 'left_unpaid'].includes(ride.user_booking_status)) ? 'Manage in Dashboard' : 'Book Now')
                                        ) :
                                            ride.status === 'bookable' ? 'Login to Book' : 'Trip cannot be booked'}

                                    </Button>
                                </Group>
                            </Container>
                        </Paper>
                    )}
                </Transition>

                <Modal opened={bookingOpen} onClose={() => setBookingOpen(false)} title="Booking Details" centered>
                    <Stack gap="sm">
                        <NumberInput
                            label="Seats"
                            description={`Max ${ride.seats.total - ride.seats.taken}`}
                            min={1}
                            max={ride.seats.total - ride.seats.taken}
                            value={bookingData.seats}
                            onChange={(v) => setBookingData({ ...bookingData, seats: Number(v) })}
                            required
                        />

                        <Group grow>
                            <NumberInput
                                label="Big Luggage"
                                description={`Max ${ride.rules.luggage.big * bookingData.seats}`}
                                min={0}
                                max={(ride.rules.luggage.big * bookingData.seats)}
                                value={bookingData.bigLuggage}
                                onChange={(v) => setBookingData({ ...bookingData, bigLuggage: Number(v) })}
                            />
                            <NumberInput
                                label="Small Luggage"
                                description={`Max ${ride.rules.luggage.small * bookingData.seats}`}
                                min={0}
                                max={(ride.rules.luggage.small * bookingData.seats)}
                                value={bookingData.smallLuggage}
                                onChange={(v) => setBookingData({ ...bookingData, smallLuggage: Number(v) })}
                            />
                        </Group>

                        {/* Payment Method Selection */}
                        {ride.rules.payment.methods && ride.rules.payment.methods.length > 0 ? (
                            <Select
                                label="Intended Payment Method"
                                placeholder="Select how you plan to pay"
                                data={ride.rules.payment.methods}
                                value={bookingData.intendedPaymentMethod}
                                onChange={(value) => setBookingData({ ...bookingData, intendedPaymentMethod: value || '' })}
                                required
                                allowDeselect={false}
                            />
                        ) : (
                            <TextInput
                                label="Intended Payment Method"
                                value="None"
                                disabled
                                description="No specific payment methods listed by driver"
                            />
                        )}


                        <Group justify="space-between" mb={0} pb={0}>
                            <Text size="sm" fw={500}>Preferred Pickup Time</Text>
                            <Button
                                variant="transparent"
                                size="compact-xs"
                                style={{ fontSize: 11, height: 'auto' }}
                                onClick={() => setBookingData(prev => ({ ...prev, pickupTime: new Date(ride.departure_time) }))}
                            >
                                Reset to Departure
                            </Button>
                        </Group>
                        <DateTimePicker
                            description={(() => {
                                const f = ride.rules.flexibility;
                                if (typeof f === 'object' && f !== null) {
                                    const h = f.hours || 0;
                                    const m = f.minutes || 0;
                                    if (h === 0 && m === 0) return 'Exact time only';

                                    const parts = [];
                                    if (h > 0) parts.push(`${h} hr${h > 1 ? 's' : ''}`);
                                    if (m > 0) parts.push(`${m} min${m > 1 ? 's' : ''}`);
                                    return `Flexibility: +/- ${parts.join(' ')}`;
                                }
                                return 'Optional';
                            })()}
                            leftSection={<IconClock size={16} />}
                            value={bookingData.pickupTime}
                            valueFormat="MM/DD/YYYY HH:mm"
                            onChange={(date: any) => {
                                const d = (typeof date === 'string' && date) ? new Date(date) : date;
                                setBookingData({ ...bookingData, pickupTime: d });
                            }}
                        />

                        <Button
                            fullWidth
                            onClick={handleBook}
                            loading={bookingSubmitting}
                            disabled={ride.rules.payment.methods && ride.rules.payment.methods.length > 0 && !bookingData.intendedPaymentMethod}
                        >
                            Confirm Booking
                        </Button>
                    </Stack>
                </Modal>

            </Stack>
        </Container >
    );
}