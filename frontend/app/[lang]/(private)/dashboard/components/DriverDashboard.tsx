import { useEffect, useState, useCallback } from 'react';
import { Container, Title, Button, Stack, Text, Loader, Center, Group } from '@mantine/core';
import { useAuth } from '@/components/firebase/AuthContext';
import { useTranslation } from 'react-i18next';
import { TripCard } from './TripCard';
import { IconRefresh, IconPlus } from '@tabler/icons-react';
import { LocalizedLink } from '@/components/LocalizedLink';

interface Trip {
    id: string;
    from_text: string;
    to_text: string;
    departure_time: string;
    status: 'bookable' | 'full' | 'departed' | 'done' | 'cancelled' | 'aborted';
    seats_taken: number;
    total_seats: number;
    price: string;
    make?: string;
    model?: string;
    plate?: string;
    color?: string;
    start_check_in?: boolean;
    driver_phone?: string;
    car_id?: string;
}

export function DriverDashboard() {
    const { t } = useTranslation('common');
    const { user } = useAuth();
    const [trips, setTrips] = useState<Trip[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [nextCursor, setNextCursor] = useState<string | null>(null);

    const fetchTrips = useCallback(async (cursor: string | null = null) => {
        if (!user) return;

        try {
            const token = await user.getIdToken();
            let url = '/api/trips/upcoming?limit=10';
            if (cursor) {
                url += `&cursor=${cursor}`;
            }

            const res = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) throw new Error('Failed to fetch trips');

            const data = await res.json();

            if (cursor) {
                setTrips(prev => [...prev, ...data.trips]);
            } else {
                setTrips(data.trips);
            }
            setNextCursor(data.nextCursor);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [user]);

    useEffect(() => {
        if (user) {
            fetchTrips();
        }
    }, [user, fetchTrips]);

    useEffect(() => {
        const interval = setInterval(() => {
            fetchTrips();
        }, 30000); // 30 seconds - more responsive updates

        return () => clearInterval(interval);
    }, [fetchTrips]);

    const handleLoadMore = () => {
        if (nextCursor) {
            setLoadingMore(true);
            fetchTrips(nextCursor);
        }
    };

    const handleRefresh = () => {
        fetchTrips();
    };

    if (loading) {
        return (
            <Center py="xl">
                <Loader />
            </Center>
        );
    }

    return (
        <Stack gap="lg">
            <Group>
                <Text size="xl" fw={600}>{t('dashboard.driver.title')}</Text>
                <Group gap={0}>
                    <Button
                        variant="subtle"
                        leftSection={<IconRefresh size={16} />}
                        onClick={handleRefresh}
                        size="xs"
                    >
                        {t('dashboard.common.refresh')}
                    </Button>
                    <Button
                        component={LocalizedLink}
                        href="/newRide"
                        leftSection={<IconPlus size={16} />}
                        size="xs"
                        variant="subtle"
                    >
                        {t('dashboard.driver.postRide')}
                    </Button>
                </Group>
            </Group>

            {trips.length === 0 ? (
                <Text c="dimmed" ta="center">{t('dashboard.driver.noTrips')}</Text>
            ) : (
                <Stack gap="md">
                    {trips.map(trip => (
                        <TripCard key={trip.id} trip={trip} />
                    ))}

                    {nextCursor && (
                        <Center mt="md">
                            <Button variant="light" onClick={handleLoadMore} loading={loadingMore}>
                                {t('dashboard.common.loadMore')}
                            </Button>
                        </Center>
                    )}
                </Stack>
            )}
        </Stack>
    );
}
