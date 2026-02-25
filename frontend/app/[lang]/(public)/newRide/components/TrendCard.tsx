'use client';

import { Card, Group, Text, Badge, Button, SimpleGrid, Box, Collapse, ActionIcon, Loader, Center, Avatar, Stack, Tooltip } from '@mantine/core';
import { IconMapPin, IconArrowRight, IconCalendar, IconUsers, IconCoin, IconChevronDown, IconChevronUp, IconMessage } from '@tabler/icons-react';
import { useState } from 'react';
import { useAuth } from '@/components/firebase/AuthContext';
import { useRouter } from 'next/navigation';
import dayjs from '@/utils/dateUtils';
import { useTranslation } from 'react-i18next';

interface TripRequest {
    id: string;
    fromText: string;
    toText: string;
    seats: number;
    price: number | null;
    preferredTime: string;
    timeFlexibility: string;
    createdAt: string;
    requester: {
        id: string;
        name: string;
        photoUrl: string | null;
    };
}

export function TrendCard({
    trend,
    index,
    onApply,
    formatDate,
    formatTimePeriod,
    getDemandColor
}: {
    trend: any;
    index: number;
    onApply: (trend: any) => void;
    formatDate: (dateStr: string) => string;
    formatTimePeriod: (period: string) => string;
    getDemandColor: (level: string) => string;
}) {
    const { t } = useTranslation('common');
    const { user, handleProtectedAction } = useAuth();
    const router = useRouter();

    const [expanded, setExpanded] = useState(false);
    const [requests, setRequests] = useState<TripRequest[]>([]);
    const [loading, setLoading] = useState(false);
    const [fetched, setFetched] = useState(false);

    const toggleExpand = () => {
        if (!expanded && !fetched) {
            fetchRequests();
        }
        setExpanded(!expanded);
    };

    const fetchRequests = async () => {
        setLoading(true);
        try {
            const token = user ? await user.getIdToken() : '';
            const params = new URLSearchParams({
                origin_lat: trend.cluster.originCenter.lat.toString(),
                origin_lng: trend.cluster.originCenter.lng.toString(),
                dest_lat: trend.cluster.destinationCenter.lat.toString(),
                dest_lng: trend.cluster.destinationCenter.lng.toString(),
                date: trend.date,
                time_category: trend.timeCategory,
            });

            const headers: any = {};
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const res = await fetch(`/api/ride-requests/trends/details?${params.toString()}`, { headers });
            if (res.ok) {
                const data = await res.json();
                setRequests(data.requests || []);
                setFetched(true);
            }
        } catch (e) {
            console.error('Failed to fetch individual requests', e);
        } finally {
            setLoading(false);
        }
    };

    const handleMessage = (requesterId: string) => {
        handleProtectedAction(() => {
            router.push(`/messages?userId=${requesterId}`);
        });
    };

    return (
        <Card withBorder shadow="xs" p="sm" radius="sm">
            <Group justify="space-between" mb="xs">
                <Group gap="xs">
                    <IconMapPin size={16} />
                    <Text size="sm" fw={500}>
                        {trend.fromText} → {trend.toText}
                    </Text>
                </Group>
                <Group gap="xs">
                    <Badge color="blue" size="sm">
                        #{index + 1}
                    </Badge>
                    <Button
                        size="xs"
                        variant="light"
                        color="green"
                        leftSection={<IconArrowRight size={14} />}
                        onClick={() => onApply(trend)}
                    >
                        {t('rides.trends.apply')}
                    </Button>
                    <ActionIcon variant="subtle" color="gray" onClick={toggleExpand}>
                        {expanded ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
                    </ActionIcon>
                </Group>
            </Group>
            <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="xs">
                <Box>
                    <Group gap={4}>
                        <IconCalendar size={14} />
                        <Text size="xs" c="dimmed">{t('rides.trends.dateTime')}</Text>
                    </Group>
                    <Text size="sm" fw={500}>
                        {formatDate(trend.date)}
                    </Text>
                    <Text size="xs" c="dimmed">
                        {formatTimePeriod(trend.timeCategory)}
                    </Text>
                </Box>
                <Box>
                    <Group gap={4}>
                        <IconUsers size={14} />
                        <Text size="xs" c="dimmed">{t('rides.trends.demand')}</Text>
                    </Group>
                    <Text size="sm" fw={500}>
                        {trend.demand.totalSeats} {t('rides.trends.seats')}
                    </Text>
                    <Text size="xs" c="dimmed">
                        {trend.demand.requestCount} {t('rides.trends.requests')}
                    </Text>
                </Box>
                <Box>
                    <Group gap={4}>
                        <IconCoin size={14} />
                        <Text size="xs" c="dimmed">{t('rides.trends.priceRange')}</Text>
                    </Group>
                    <Text size="sm" fw={500}>
                        {trend.priceRange.min != null && trend.priceRange.max != null
                            ? `$${trend.priceRange.min} - $${trend.priceRange.max}`
                            : '-'}
                    </Text>
                    {trend.priceRange.avg != null && (
                        <Text size="xs" c="dimmed">
                            {t('rides.trends.avg')}: ${trend.priceRange.avg}
                        </Text>
                    )}
                </Box>
                <Box>
                    <Text size="xs" c="dimmed">{t('rides.trends.demandLevel')}</Text>
                    <Badge color={getDemandColor(trend.demand.demandLevel)} variant="light">
                        {t(`rides.trends.levels.${trend.demand.demandLevel}` as any)}
                    </Badge>
                </Box>
            </SimpleGrid>

            <Collapse in={expanded}>
                <Box mt="md" pt="sm" style={(theme) => ({ borderTop: `1px solid ${theme.colors.gray[2]}` })}>
                    {loading ? (
                        <Center py="sm"><Loader size="sm" /></Center>
                    ) : requests.length === 0 ? (
                        <Text c="dimmed" size="sm" ta="center">No active requests found for this trend.</Text>
                    ) : (
                        <Stack gap="xs">
                            {requests.map(req => (
                                <Card key={req.id} bg="gray.0" p="xs" radius="sm">
                                    <Group justify="space-between" align="center" wrap="nowrap">
                                        <Group gap="sm" style={{ flex: 1, overflow: 'hidden' }} wrap="nowrap">
                                            <Avatar src={req.requester.photoUrl} size="sm" radius="xl" color="blue">
                                                {req.requester.name.charAt(0)}
                                            </Avatar>
                                            <Box style={{ flex: 1, overflow: 'hidden' }}>
                                                <Group gap="xs" wrap="nowrap">
                                                    <Text size="sm" fw={500} truncate>{req.requester.name}</Text>
                                                    <Badge size="xs" variant="dot">{req.seats} seat{req.seats > 1 ? 's' : ''}</Badge>
                                                    {req.price && <Badge color="green" size="xs" variant="light">${req.price}</Badge>}
                                                </Group>
                                                <Text size="xs" c="dimmed" truncate>
                                                    {dayjs(req.preferredTime).format('h:mm A')} (±{(() => {
                                                        const f = req.timeFlexibility as any;
                                                        if (!f) return '0m';
                                                        if (typeof f === 'string') return f.replace('00:00', 'm');
                                                        const h = f.hours || 0;
                                                        const m = f.minutes || 0;
                                                        if (h === 0 && m === 0) return '0m';
                                                        const parts = [];
                                                        if (h > 0) parts.push(`${h}h`);
                                                        if (m > 0) parts.push(`${m}m`);
                                                        return parts.join(' ');
                                                    })()}) • {req.fromText} → {req.toText}
                                                </Text>
                                            </Box>
                                        </Group>

                                        <Tooltip label="Message Requester">
                                            <ActionIcon
                                                variant="light"
                                                color="blue"
                                                onClick={() => handleMessage(req.requester.id)}
                                            >
                                                <IconMessage size={16} />
                                            </ActionIcon>
                                        </Tooltip>
                                    </Group>
                                </Card>
                            ))}
                        </Stack>
                    )}
                </Box>
            </Collapse>
        </Card>
    );
}
