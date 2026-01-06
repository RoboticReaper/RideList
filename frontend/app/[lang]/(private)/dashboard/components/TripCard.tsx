import { Card, Text, Badge, Group, Stack, Button, Flex, Alert, Anchor } from '@mantine/core';
import { getTripStatusConfig } from '@/utils/statusUtils';
import { IconMapPin, IconCalendar, IconUsers, IconSteeringWheel, IconAlertTriangle } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { LocalizedLink } from '@/components/LocalizedLink';

interface Trip {
    // ... existing interface

    id: string;
    from_text: string;
    to_text: string;
    departure_time: string;
    status: 'bookable' | 'full' | 'departed' | 'done' | 'cancelled' | 'locked' | 'aborted';
    seats_taken: number;
    total_seats: number;
    price: string;
    make?: string;
    model?: string;
    plate?: string;
    color?: string;
    start_check_in?: boolean;
    driver_phone?: string;
    driver_id?: string;
}

interface TripCardProps {
    trip: Trip;
}

export function TripCard({ trip }: TripCardProps) {


    return (
        <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Stack gap="md">
                {/* Header: Route and Status */}
                <Flex justify="space-between" align="start" direction={{ base: 'column', sm: 'row' }} gap="xs">
                    <Stack gap={4}>
                        <Group gap="xs">
                            <IconMapPin size={18} style={{ color: 'var(--mantine-color-blue-6)' }} />
                            <Text fw={600} size="lg" lineClamp={1} title={trip.from_text}>
                                {trip.from_text.split(',')[0]}
                            </Text>
                            <Text size="lg" c="dimmed">
                                &rarr;
                            </Text>
                            <Text fw={600} size="lg" lineClamp={1} title={trip.to_text}>
                                {trip.to_text.split(',')[0]}
                            </Text>
                        </Group>
                        <Text size="xs" c="dimmed" ml={28}>
                            {trip.from_text} &rarr; {trip.to_text}
                        </Text>
                    </Stack>
                    <Group gap="xs">
                        <Badge color={getTripStatusConfig(trip.status).color} variant="light">
                            {getTripStatusConfig(trip.status).label.toUpperCase()}
                        </Badge>
                        {trip.status !== "done" && trip.status !== "cancelled" && trip.start_check_in && (
                            <Badge color="cyan" variant="light">
                                Check-in Started
                            </Badge>
                        )}
                    </Group>
                </Flex>

                <Card.Section withBorder inheritPadding py="xs">
                    <Group justify="space-between">
                        {/* Date & Time */}
                        <Group gap="xs">
                            <IconCalendar size={16} />
                            <Text size="sm">
                                {dayjs(trip.departure_time).format('MMM D, YYYY h:mm A')}
                            </Text>
                        </Group>

                        {/* Seats */}
                        <Group gap="xs">
                            <IconUsers size={16} />
                            <Text size="sm">
                                {trip.total_seats - trip.seats_taken} / {trip.total_seats} seats left
                            </Text>
                        </Group>
                    </Group>
                </Card.Section>

                {/* Car Info */}
                {(trip.make || trip.model) && (
                    <Group gap="xs" c="dimmed">
                        <IconSteeringWheel size={16} />
                        <Text size="sm">
                            {trip.color} {trip.make} {trip.model} • {trip.plate}
                        </Text>
                    </Group>
                )}

                {/* Validation Warnings */}
                {(!trip.driver_phone || !trip.make) && trip.status !== 'cancelled' && (
                    <Stack gap="xs">
                        {!trip.driver_phone && (
                            <Alert color="red" variant="light" title="Action Required" icon={<IconAlertTriangle size={16} />}>
                                Please add a phone number to <Anchor component={LocalizedLink} href={`/profile/${trip.driver_id}`} style={{ textDecoration: 'underline' }}>your profile</Anchor> to start this trip.
                            </Alert>
                        )}
                        {!trip.id && (
                            <Alert color="red" variant="light" title="Action Required" icon={<IconAlertTriangle size={16} />}>
                                Please <Anchor component={LocalizedLink} href={`/dashboard/${trip.id}?tab=edit`} style={{ textDecoration: 'underline' }}>assign a car</Anchor> to this trip.
                            </Alert>
                        )}
                    </Stack>
                )}

                <Button component={LocalizedLink} href={`/dashboard/${trip.id}`} variant="light" fullWidth mt="xs">
                    Manage Trip
                </Button>
            </Stack>
        </Card>
    );
}
