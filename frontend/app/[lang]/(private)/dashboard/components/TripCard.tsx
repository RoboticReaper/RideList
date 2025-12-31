import { Card, Text, Badge, Group, Stack, Button, Flex } from '@mantine/core';
import { IconMapPin, IconCalendar, IconUsers, IconSteeringWheel } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { LocalizedLink } from '@/components/LocalizedLink';

interface Trip {
    // ... existing interface

    id: string;
    from_text: string;
    to_text: string;
    departure_time: string;
    status: 'bookable' | 'full' | 'departed' | 'done' | 'cancelled' | 'locked';
    seats_taken: number;
    total_seats: number;
    price: string;
    make?: string;
    model?: string;
    plate?: string;
    color?: string;
}

interface TripCardProps {
    trip: Trip;
}

export function TripCard({ trip }: TripCardProps) {
    const statusColors: Record<string, string> = {
        bookable: 'green',
        full: 'orange',
        departed: 'blue',
        done: 'gray',
        cancelled: 'red',
        locked: 'red',
    };

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
                    <Badge color={statusColors[trip.status] || 'gray'} variant="light">
                        {trip.status.toUpperCase()}
                    </Badge>
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

                <Button component={LocalizedLink} href={`/dashboard/${trip.id}`} variant="light" fullWidth mt="xs">
                    Manage Trip
                </Button>
            </Stack>
        </Card>
    );
}
