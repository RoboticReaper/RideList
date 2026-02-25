'use client'

import { TripInputBar } from '@/components/TripInputBar/TripInputBar';
import { Container, Title, Button, Collapse, Stack, Card, Text, Box, Loader, Center } from '@mantine/core';
import { TrendCard } from './components/TrendCard';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/components/firebase/AuthContext';
import { useDisclosure } from '@mantine/hooks';
import { useState, useEffect } from 'react';
import { IconTrendingUp, IconChevronDown, IconChevronUp, IconMapPin, IconUsers, IconCoin, IconClock, IconArrowRight, IconCalendar } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import dayjs from '@/utils/dateUtils';

interface TrendData {
    fromText: string;
    toText: string;
    date: string;
    timeCategory: 'morning' | 'afternoon' | 'evening' | 'night';
    cluster: {
        originCenter: { lat: number; lng: number };
        destinationCenter: { lat: number; lng: number };
    };
    demand: {
        totalSeats: number;
        requestCount: number;
        confidenceScore: number;
        demandLevel: 'low' | 'medium' | 'high';
    };
    priceRange: {
        min: number | null;
        max: number | null;
        avg: number | null;
    };
}

export default function NewRidePage() {
    const { t } = useTranslation('common');
    const { user, handleProtectedAction } = useAuth();
    const [trendsOpened, { toggle: toggleTrends, close: closeTrends }] = useDisclosure(false);
    const [trends, setTrends] = useState<TrendData[]>([]);
    const [loadingTrends, setLoadingTrends] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [trendsFetched, setTrendsFetched] = useState(false);

    // Selected trend for autofill
    const [selectedFrom, setSelectedFrom] = useState<string | undefined>(undefined);
    const [selectedTo, setSelectedTo] = useState<string | undefined>(undefined);
    const [selectedFromCoords, setSelectedFromCoords] = useState<{ lat: number; lng: number } | undefined>(undefined);
    const [selectedToCoords, setSelectedToCoords] = useState<{ lat: number; lng: number } | undefined>(undefined);
    const [selectedDateTime, setSelectedDateTime] = useState<Date | undefined>(undefined);
    const [selectedFlexibility, setSelectedFlexibility] = useState<number | undefined>(undefined);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Fetch trends when collapsible is opened for the first time
    useEffect(() => {
        const fetchTrends = async () => {
            if (!user || !trendsOpened || trendsFetched) return;

            setLoadingTrends(true);
            try {
                const token = await user.getIdToken();
                const res = await fetch('/api/ride-requests/trends', {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setTrends(data.trends || []);
                    setTrendsFetched(true);
                }
            } catch (e) {
                console.error('Failed to fetch trends', e);
            } finally {
                setLoadingTrends(false);
            }
        };

        fetchTrends();
    }, [user, trendsOpened, trendsFetched]);

    // Handle applying a trend to the form
    const handleApplyTrend = (trend: TrendData) => {
        setSelectedFrom(trend.fromText);
        setSelectedTo(trend.toText);
        setSelectedFromCoords(trend.cluster.originCenter);
        setSelectedToCoords(trend.cluster.destinationCenter);

        // Calculate mid-point time based on category
        let hour = 9; // morning (6-12) -> 9am
        if (trend.timeCategory === 'afternoon') hour = 15; // 12-18 -> 3pm
        if (trend.timeCategory === 'evening') hour = 21; // 18-24 -> 9pm
        if (trend.timeCategory === 'night') hour = 3; // 0-6 -> 3am

        // Create Date object representing wall-clock time in local timezone
        // This ensures the datetime-local input shows the correct time (e.g. 09:00) 
        // regardless of the user's timezone, which TripInputBar then treats as Chicago time.
        console.log('Applying Trend:', trend);
        // Handle ISO date strings (e.g. 2026-02-12T06:00:00.000Z)
        const datePart = trend.date.includes('T') ? trend.date.split('T')[0] : trend.date;
        const [year, month, day] = datePart.split('-').map(Number);
        console.log('Parsed Date Components:', { year, month, day, hour });

        const dateTime = new Date(year, month - 1, day, hour, 0, 0);
        console.log('Calculated DateTime:', dateTime);

        if (isNaN(dateTime.getTime())) {
            console.error('Invalid Date created from trend:', trend);
            notifications.show({ title: 'Error', message: 'Invalid date from trend data', color: 'red' });
            return;
        }

        setSelectedDateTime(dateTime);
        setSelectedFlexibility(3); // +/- 3 hours covers the 6-hour block

        closeTrends();
        notifications.show({
            title: t('rides.trends.applied'),
            message: `${trend.fromText} → ${trend.toText}`,
            color: 'green'
        });
    };

    // Get color for demand level
    const getDemandColor = (level: string) => {
        switch (level) {
            case 'high': return 'red';
            case 'medium': return 'orange';
            default: return 'gray';
        }
    };



    // Format time period for display
    const formatTimePeriod = (period: string) => {
        const key = `rides.trends.time.${period}` as any;
        return t(key);
    };

    // Format date for display
    const formatDate = (dateStr: string) => {
        const date = dayjs(dateStr);
        const today = dayjs().startOf('day');
        const tomorrow = today.add(1, 'day');

        if (date.isSame(today, 'day')) {
            return t('rides.card.today');
        } else if (date.isSame(tomorrow, 'day')) {
            return t('rides.trends.tomorrow');
        } else {
            return date.format('ddd, MMM D');
        }
    };

    return (
        <Container size="xl" py="xl">
            <Title order={2} mb="lg">{t('rides.create.title')}</Title>

            {/* Trends Button - Always show, handle auth internally */}
            {mounted && (
                <Box mb="md">
                    <Button
                        variant="light"
                        leftSection={<IconTrendingUp size={18} />}
                        rightSection={trendsOpened ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
                        onClick={() => handleProtectedAction(toggleTrends)}
                    >
                        {t('rides.trends.viewTrends')}
                    </Button>

                    <Collapse in={trendsOpened}>
                        <Card withBorder mt="md" p="md">
                            <Text fw={600} mb="sm">{t('rides.trends.title')}</Text>
                            <Text size="sm" c="dimmed" mb="md">{t('rides.trends.description')}</Text>

                            {loadingTrends ? (
                                <Center py="md">
                                    <Loader size="sm" />
                                </Center>
                            ) : trends.length === 0 ? (
                                <Text c="dimmed" ta="center" py="md">
                                    {t('rides.trends.noTrends')}
                                </Text>
                            ) : (
                                <Stack gap="sm">
                                    {trends.slice(0, 10).map((trend, index) => (
                                        <TrendCard
                                            key={index}
                                            trend={trend}
                                            index={index}
                                            onApply={handleApplyTrend}
                                            formatDate={formatDate}
                                            formatTimePeriod={formatTimePeriod}
                                            getDemandColor={getDemandColor}
                                        />
                                    ))}
                                </Stack>
                            )}
                        </Card>
                    </Collapse>
                </Box>
            )}

            <TripInputBar
                key={selectedDateTime ? selectedDateTime.getTime() : 'default'}
                initialFrom={selectedFrom}
                initialTo={selectedTo}
                initialFromCoords={selectedFromCoords}
                initialToCoords={selectedToCoords}
                initialDateTime={selectedDateTime}
                initialFlexibility={selectedFlexibility}
            />
        </Container>
    );
}