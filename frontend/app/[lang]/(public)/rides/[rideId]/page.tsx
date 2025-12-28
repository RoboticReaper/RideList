'use client'

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
    Container, Title, Text, Card, Group, Badge, Stack, Grid, LoadingOverlay, Alert, Divider, Avatar, ThemeIcon, Progress, Tooltip, SimpleGrid, Paper, Button, Popover, Transition
} from '@mantine/core';
import { useAuth } from '@/components/firebase/AuthContext';
import { useMediaQuery, useIntersection } from '@mantine/hooks';
import {
    IconMapPin, IconCalendar, IconArmchair, IconCoin, IconInfoCircle, IconLuggage, IconClock, IconCar, IconStar, IconCheck, IconUser, IconAlertCircle, IconDashboard
} from '@tabler/icons-react';
import { LocalizedLink } from '@/components/LocalizedLink';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

// Updated Interface matching API response
interface RideDetails {
    id: string;
    status: string;
    created_at: string;
    modified_at: string;
    from_text: string;
    to_text: string;
    origin_geog: any;
    destination_geog: any;
    departure_time: string;
    price: string;
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
    } | null;
    driver: {
        id: string;
        name: string;
        verified: boolean;
        photo_url: string | null;
        member_since: string;
        rating: number | null;
        completed_trips: number;
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
        time_flexibility: any;
        payment: {
            methods: string[];
            handle: string | null;
        };
        auto_accept: boolean;
        cancellation_policy: string | null;
        cutoff_time: any;
    };
}

export default function RidePage() {
    const params = useParams();
    const rideId = params.rideId as string;
    const { user, handleProtectedAction } = useAuth();
    const [ride, setRide] = useState<RideDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const isSmallScreen = useMediaQuery('(max-width: 400px)');
    const { ref, entry } = useIntersection({
        threshold: 0,
    });

    useEffect(() => {
        if (!rideId) return;

        const fetchRide = async () => {
            try {
                const token = await user?.getIdToken();
                const res = await fetch(`/api/trips/${rideId}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
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

        fetchRide();
    }, [rideId]);

    if (loading) return <LoadingOverlay visible />;
    if (error) return <Container py="xl"><Alert color="red" title="Error" icon={<IconInfoCircle />}>{error}</Alert></Container>;
    if (!ride) return <Container py="xl"><Alert color="yellow" title="Not Found" icon={<IconInfoCircle />}>Ride not found</Alert></Container>;

    const memberSinceYear = dayjs(ride.driver.member_since).format('YYYY');

    return (
        <Container size="md" py="xl" w="100%">
            <Stack gap="xl">

                {/* Header Section */}
                <div>
                    <Group justify="space-between" align="start" mb="xs">
                        <Badge size="lg" variant="gradient" gradient={{ from: 'blue', to: 'cyan' }}>
                            {ride.status === 'bookable' ? 'Open for Booking' : ride.status.toUpperCase()}
                        </Badge>
                        <Text size="xs" c="dimmed">Posted {dayjs(ride.created_at).fromNow()}</Text>
                    </Group>

                    <Group justify="space-between" align="end">
                        <Title order={2} style={{ lineHeight: 1.2 }}>
                            {ride.from_text} <Text span c="dimmed" inherit>→</Text> {ride.to_text}
                        </Title>

                        {user && user.uid === ride.driver.id && (
                            <Button
                                component={LocalizedLink}
                                href={`/dashboard/${rideId}`}
                                leftSection={<IconDashboard size={16} />}
                                variant="light"
                            >
                                Manage Trip
                            </Button>
                        )}
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
                                {ride.rules.time_flexibility && (
                                    <Text span size="sm" c="dimmed" ml={4}>
                                        (+/- {(() => {
                                            const f = ride.rules.time_flexibility;
                                            if (typeof f === 'object' && f !== null) {
                                                const h = f.hours || 0;
                                                const m = f.minutes || 0;
                                                const total = h + m / 60;
                                                return total > 0 ? `${total} hours` : 'Flexible';
                                            }
                                            return '0.25 hours';
                                        })()})
                                    </Text>
                                )}
                            </Text>
                        </Group>
                    </Group>
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
                                        <Button
                                            ref={ref}
                                            mt="sm"
                                            size="sm"
                                            variant="filled"
                                            color={ride.status === 'bookable' ? 'blue' : 'gray'}
                                            disabled={ride.status !== 'bookable'}
                                            onClick={() => {
                                                if (user) {
                                                    // Handle Booking Logic (TODO)
                                                    alert('Booking flow to be implemented');
                                                } else {
                                                    handleProtectedAction();
                                                }
                                            }}
                                        >
                                            {user ? 'Book Now' : 'Login to Book'}
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
                                        <Text size="sm" c="dimmed">Cash Only</Text>
                                    )}
                                </Group>

                                <Divider mb="sm" />

                                <div>
                                    <Text size="xs" c="dimmed" mb={4}>Payment handle / contact</Text>
                                    <Text size="sm" c={ride.rules.payment.handle ? undefined : "dimmed"}>
                                        {ride.rules.payment.handle || 'No special requirements'}
                                    </Text>
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
                                    </div>
                                    <Button
                                        size="md"
                                        variant="filled"
                                        color={ride.status === 'bookable' ? 'blue' : 'gray'}
                                        disabled={ride.status !== 'bookable'}
                                        onClick={() => {
                                            if (user) {
                                                alert('Booking flow to be implemented');
                                            } else {
                                                handleProtectedAction();
                                            }
                                        }}
                                    >
                                        {user ? 'Book Now' : 'Login to Book'}
                                    </Button>
                                </Group>
                            </Container>
                        </Paper>
                    )}
                </Transition>

            </Stack>
        </Container >
    );
}