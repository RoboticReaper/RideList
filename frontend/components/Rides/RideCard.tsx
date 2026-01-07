'use client';
import { Paper, Text, Group, Avatar, Stack, Badge, Button, ThemeIcon, Tooltip, Progress } from '@mantine/core';
import {
    IconClock,
    IconMapPin,
    IconLuggage,
    IconCreditCard,
    IconCash,
    IconBolt,
    IconBuildingBank,
    IconCurrencyBitcoin,
    IconBrandPaypal,
    IconLock, // Keep imports
    IconForbid, // Keep imports
    IconCheck, // Keep imports
} from '@tabler/icons-react';
import Link from 'next/link';
import { getTripStatusConfig } from '@/utils/statusUtils';
import { useTranslation } from 'react-i18next';

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
        driver_photo_url: string | null;
        driver_rating: number | null;
        driver_completed_trips: number | null;

        // Rules
        big_luggage_lim: number;
        small_luggage_lim: number;
        auto_accept: boolean;
        payment_methods: string[];
        departure_time_flexibility?: string;
    };
}

const getPaymentIcon = (method: string) => {
    const m = method.toLowerCase();
    if (m.includes('cash')) return <IconCash size={14} />;
    if (m.includes('transfer')) return <IconBuildingBank size={14} />;
    if (m.includes('crypto')) return <IconCurrencyBitcoin size={14} />;
    if (m.includes('paypal')) return <IconBrandPaypal size={14} />;
    return <IconCreditCard size={14} />;
};

const formatFlexibility = (flex: string | undefined) => {
    if (!flex) return null;
    try {
        const parts = flex.split(':');
        if (parts.length >= 2) {
            const h = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10);
            if (h === 0 && m === 0) return null;
            if (h > 0) return `± ${h}h ${m > 0 ? `${m}m` : ''}`;
            return `± ${m} mins`;
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

    // Format Date using current i18n locale
    const isToday = new Date().toDateString() === date.toDateString();
    const dateStr = isToday ? t('rides.card.today') : date.toLocaleDateString(i18n.language, { month: 'short', day: 'numeric' });
    const timeStr = date.toLocaleTimeString(i18n.language, { hour: 'numeric', minute: '2-digit' });

    // Relative time
    const diffMs = date.getTime() - new Date().getTime();
    const diffHrs = Math.floor(diffMs / 3600000);
    const diffMins = Math.floor((diffMs % 3600000) / 60000);
    const relativeTime = diffHrs > 0 ? `in ${diffHrs}h ${diffMins}m` : (diffMins > 0 ? `in ${diffMins}m` : '');

    const flexText = formatFlexibility(ride.departure_time_flexibility);
    const statusConfig = getTripStatusConfig(ride.status);

    return (
        <Paper withBorder p="md" radius="md" mb="sm" style={{ position: 'relative', overflow: 'hidden' }}>
            {/* Main Row: Route & Price */}
            <Group justify="space-between" align="flex-start" mb="sm" wrap="wrap">
                <Stack gap={4} style={{ flex: '3 1 200px', minWidth: '200px' }}>
                    {/* Route + Status Badge */}
                    <Group gap={6} align="center" wrap="wrap">
                        <IconMapPin size={18} style={{ opacity: 0.7, flexShrink: 0 }} />
                        <Text fw={600} size="md" style={{ lineHeight: 1.3 }}>
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
                                <Tooltip label={`Departure time flexibility: ${flexText}`}>
                                    <Text span size="xs" ml={6} c="blue.6" style={{ cursor: 'help', borderBottom: '1px dotted' }}>
                                        ({flexText})
                                    </Text>
                                </Tooltip>
                            )}
                            {relativeTime && <Text span size="xs" ml={6}>· {relativeTime}</Text>}
                        </Text>
                    </Group>
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
                            <Text size="sm" fw={600}>{ride.driver_name}</Text>
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
                        <Tooltip label={t('rides.card.autoAcceptTooltip')}>
                            <Group gap={4}>
                                <ThemeIcon size="xs" variant="transparent" color="yellow">
                                    <IconBolt size={16} />
                                </ThemeIcon>
                                <Text size="xs" c="dimmed">{t('rides.card.instant')}</Text>
                            </Group>
                        </Tooltip>
                    )}

                    {/* Luggage */}
                    <Tooltip label={t('rides.card.luggageTooltip', { big: ride.big_luggage_lim, small: ride.small_luggage_lim })}>
                        <Group gap={4}>
                            <ThemeIcon size="xs" variant="transparent" color="gray">
                                <IconLuggage size={16} />
                            </ThemeIcon>
                            <Text size="xs" c="dimmed">
                                {ride.big_luggage_lim}L / {ride.small_luggage_lim}S
                            </Text>
                        </Group>
                    </Tooltip>

                    {/* Payment Methods */}
                    {ride.payment_methods && ride.payment_methods.length > 0 && (
                        <Group gap={4} ml="auto">
                            {ride.payment_methods.map((pm) => (
                                <Tooltip key={pm} label={pm}>
                                    <ThemeIcon size="xs" variant="transparent" color="gray">
                                        {getPaymentIcon(pm)}
                                    </ThemeIcon>
                                </Tooltip>
                            ))}
                        </Group>
                    )}
                </Group>
            </Stack>
        </Paper>
    );
}
