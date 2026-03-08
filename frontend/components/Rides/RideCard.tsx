'use client';
import { Paper, Text, Group, Avatar, Stack, Badge, Button, ThemeIcon, Progress } from '@mantine/core';
import {
    IconClock,
    IconMapPin,
    IconLuggage,
    IconCreditCard,
    IconBolt,
    IconLock, // Keep imports
    IconForbid, // Keep imports
    IconCheck, // Keep imports
} from '@tabler/icons-react';
import Link from 'next/link';
import { getTripStatusConfig } from '@/utils/statusUtils';
import { useTranslation } from 'react-i18next';
import dayjs, { CHICAGO_TZ } from '@/utils/dateUtils';
import { TFunction } from 'i18next';

interface RideCardProps {
    ride: {
        id: string;
        from_text: string;
        to_text: string;
        departure_time: string;
        price: number;
        total_seats: number;
        seats_taken: number;
        status: 'bookable' | 'full' | 'locked' | 'departed' | 'cancelled' | 'aborted';

        // Driver
        driver_name: string;
        driver_verified: boolean;
        driver_community_driver: boolean;
        driver_photo_url: string | null;
        driver_rating: number | null;
        driver_completed_trips: number | null;

        // Rules
        big_luggage_lim: number;
        small_luggage_lim: number;
        big_luggage_paid: number;
        small_luggage_paid: number;
        big_luggage_paid_price: number;
        small_luggage_paid_price: number;
        auto_accept: boolean;
        payment_methods: string[];
        departure_time_flexibility?: string;

        // Optional new fields
        trip_title?: string | null;
        return_time?: string | null;
    };
}



const formatFlexibility = (flex: string | undefined, t: TFunction) => {
    if (!flex) return null;
    try {
        const parts = flex.split(':');
        if (parts.length >= 2) {
            const h = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10);
            if (h === 0 && m === 0) return null;
            if (h > 0) {
                if (m > 0) {
                    return t('rides.card.flexibility.hoursAndMinutes', { hours: h, minutes: m });
                }
                return t('rides.card.flexibility.hours', { hours: h });
            }
            return t('rides.card.flexibility.minutes', { minutes: m });
        }
    } catch (e) {
        return null;
    }
    return null;
};

export function RideCard({ ride }: RideCardProps) {
    const { t, i18n } = useTranslation('common');
    const seatsLeft = Math.max(0, ride.total_seats - ride.seats_taken);
    const date = new Date(ride.departure_time);

    // Format Date using current i18n locale and Chicago Timezone
    const chicagoDate = dayjs(ride.departure_time).tz(CHICAGO_TZ);
    const nowChicago = dayjs().tz(CHICAGO_TZ);

    const isToday = nowChicago.isSame(chicagoDate, 'day');
    const dateStr = isToday ? t('rides.card.today') : chicagoDate.format('MMM D'); // consistent simplified format
    const timeStr = chicagoDate.format('h:mm A');

    // Relative time
    const diffMs = date.getTime() - new Date().getTime();
    const diffHrs = Math.floor(diffMs / 3600000);
    const diffMins = Math.floor((diffMs % 3600000) / 60000);

    let relativeTime = '';
    if (diffHrs > 0) {
        relativeTime = t('rides.card.relativeTime.hoursAndMinutes', { hours: diffHrs, minutes: diffMins });
    } else if (diffMins > 0) {
        relativeTime = t('rides.card.relativeTime.minutes', { minutes: diffMins });
    }

    const flexText = formatFlexibility(ride.departure_time_flexibility, t);
    const statusConfig = getTripStatusConfig(ride.status);

    return (
        <Paper withBorder p="md" radius="md" mb="sm" style={{ position: 'relative', overflow: 'hidden' }}>
            {/* Main Row: Route & Price */}
            <Group justify="space-between" align="flex-start" mb="sm" wrap="wrap">
                <Stack gap={4} style={{ flex: '3 1 200px', minWidth: '200px' }}>
                    {/* Trip Title */}
                    {ride.trip_title && (
                        <Text fw={700} size="lg" style={{ lineHeight: 1.2 }}>
                            {ride.trip_title}
                        </Text>
                    )}
                    {/* Route + Status Badge */}
                    <Group gap={6} align="center" wrap="wrap">
                        <IconMapPin size={18} style={{ opacity: 0.7, flexShrink: 0 }} />
                        <Text fw={ride.trip_title ? 500 : 600} size={ride.trip_title ? 'sm' : 'md'} c={ride.trip_title ? 'dimmed' : undefined} style={{ lineHeight: 1.3 }}>
                            {ride.from_text} <Text span c="dimmed">→</Text> {ride.to_text}
                        </Text>
                        {/* Status Badge Moved Here */}
                        <Badge color={statusConfig.color} variant="light" size="xs" radius="sm">
                            {t(statusConfig.labelKey)}
                        </Badge>
                    </Group>

                    {/* Time & Flexibility */}
                    <Group gap={6} align="center" mt={2}>
                        <IconClock size={16} style={{ opacity: 0.6 }} />
                        <Text size="sm" c="dimmed">
                            <Text span fw={500} c="dark">{dateStr} · {timeStr}</Text>
                            {flexText && (
                                <Text span size="xs" ml={6} c="blue.6">
                                    ({flexText})
                                </Text>
                            )}
                            {relativeTime && <Text span size="xs" ml={6} suppressHydrationWarning>· {relativeTime}</Text>}
                        </Text>
                    </Group>
                    {ride.return_time && (
                        <Group gap={6} align="center">
                            <IconClock size={14} style={{ opacity: 0.5 }} />
                            <Text size="xs" c="dimmed">
                                {t('trip.returnTimeLabel', { time: dayjs(ride.return_time).tz(CHICAGO_TZ).format('MMM D, h:mm A') })}
                            </Text>
                        </Group>
                    )}
                </Stack>

                {/* Price & Progress Bar (Moved Here) */}
                <Stack gap={2} align="flex-end" style={{ flex: '1 1 150px', minWidth: '150px' }}>
                    <Text fw={700} size="xl" c="blue.7">${ride.price}</Text>

                    {/* Progress Bar moved here */}
                    <Stack gap={2} align="flex-end" w={{ base: '100%', xs: '150px' }}>
                        <Text size="xs" c="dimmed" lh={1.2}>
                            {t('rides.card.seatsAvailable', { count: seatsLeft, total: ride.total_seats })}
                        </Text>
                        <Progress
                            value={((ride.total_seats - ride.seats_taken) / ride.total_seats) * 100}
                            size="sm"
                            color={
                                (ride.total_seats - ride.seats_taken) === ride.total_seats ? 'green' :
                                    (ride.total_seats - ride.seats_taken) > 1 ? 'yellow' : 'red'
                            }
                            radius="xl"
                            style={{ width: '100%' }}
                        />
                    </Stack>
                </Stack>
            </Group>

            <Stack gap="sm">

                {/* Driver Info */}
                <Group justify="space-between" align="center" style={{ borderTop: '1px solid var(--mantine-color-gray-2)', paddingTop: 12 }}>
                    <Group gap="xs">
                        <Avatar src={ride.driver_photo_url} radius="xl" size="md" />
                        <Stack gap={0}>
                            <Group gap={6}>
                                <Text size="sm" fw={600}>{ride.driver_name}</Text>
                                {ride.driver_verified && <Badge color="green" size="xs" leftSection={<IconCheck size={10} />}>{t('rides.detail.driver.verifiedStudent')}</Badge>}
                                {ride.driver_community_driver && <Badge color="blue" size="xs" leftSection={<IconCheck size={10} />}>{t('rides.detail.driver.communityDriver')}</Badge>}
                            </Group>
                            <Group gap={6}>
                                <Text size="xs" c="dimmed">★ {ride.driver_rating?.toFixed(1) || 'New'}</Text>
                                <Text size="xs" c="dimmed">•</Text>
                                <Text size="xs" c="dimmed">{t('rides.card.trips', { count: ride.driver_completed_trips || 0 })}</Text>
                            </Group>
                        </Stack>
                    </Group>

                    {/* View Details Link */}
                    <Button
                        component={Link}
                        href={`/rides/${ride.id}`}
                        variant="light"
                        size="xs"
                        radius="xl"
                    >
                        {t('rides.card.viewDetails')}
                    </Button>
                </Group>

                {/* Convenience Icons (Footer) */}
                <Group gap="lg" mt={4}>
                    {/* Auto Accept */}
                    {ride.auto_accept && (
                        <Group gap={4}>
                            <ThemeIcon size="xs" variant="transparent" color="yellow">
                                <IconBolt size={16} />
                            </ThemeIcon>
                            <Text size="xs" c="dimmed">{t('rides.card.instant')}</Text>
                        </Group>
                    )}

                    {/* Luggage */}
                    <Group gap={4}>
                        <ThemeIcon size="xs" variant="transparent" color="gray">
                            <IconLuggage size={16} />
                        </ThemeIcon>
                        <Text size="xs" c="dimmed">
                            {(ride.big_luggage_lim + (ride.big_luggage_paid || 0))}L / {(ride.small_luggage_lim + (ride.small_luggage_paid || 0))}S
                        </Text>
                    </Group>

                    {/* Payment Methods */}
                    {ride.payment_methods && ride.payment_methods.length > 0 && (
                        <Group gap={4} ml="auto">
                            <ThemeIcon size="xs" variant="transparent" color="gray">
                                <IconCreditCard size={16} />
                            </ThemeIcon>
                            <Text size="xs" c="dimmed">
                                {ride.payment_methods.join(', ')}
                            </Text>
                        </Group>
                    )}
                </Group>
            </Stack>
        </Paper>
    );
}
