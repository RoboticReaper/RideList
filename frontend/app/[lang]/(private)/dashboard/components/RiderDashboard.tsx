import { useEffect, useState, useCallback } from 'react';
import { Stack, Text, Loader, Center, Button, Group } from '@mantine/core';
import { useAuth } from '@/components/firebase/AuthContext';
import { RiderTripCard } from './RiderTripCard';
import { IconRefresh } from '@tabler/icons-react';

interface Trip {
    id: string;
    from_text: string;
    to_text: string;
    departure_time: string;
    trip_status: 'bookable' | 'full' | 'departed' | 'done' | 'cancelled';
    booking_status: 'waiting_approval' | 'joined_with_pay_window' | 'pending_pay_confirmation_from_driver' | 'confirmed';
    seats_booked: number;
    price: string;
    booking_id: string;
    big_luggage: number;
    small_luggage: number;
}

export function RiderDashboard() {
    const { user } = useAuth();
    const [trips, setTrips] = useState<Trip[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [nextCursor, setNextCursor] = useState<string | null>(null);

    const fetchTrips = useCallback(async (cursor: string | null = null) => {
        if (!user) return;

        try {
            const token = await user.getIdToken();
            let url = '/api/trips/rider/upcoming?limit=10';
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

    const handleRefresh = () => {
        fetchTrips();
    };

    const handleLoadMore = () => {
        if (nextCursor) {
            setLoadingMore(true);
            fetchTrips(nextCursor);
        }
    };

    useEffect(() => {
        const interval = setInterval(() => {
            fetchTrips();
        }, 120000); // 2 minutes

        return () => clearInterval(interval);
    }, [fetchTrips]);

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
                <Text size="xl" fw={600}>Upcoming Rides</Text>
                <Button
                    variant="subtle"
                    leftSection={<IconRefresh size={16} />}
                    onClick={handleRefresh}
                    size="xs"
                >
                    Refresh
                </Button>
            </Group>
            {trips.length === 0 ? (
                <Text c="dimmed" ta="center">You have no upcoming trips.</Text>
            ) : (
                <Stack gap="md">
                    {trips.map(trip => (
                        <RiderTripCard key={trip.id} trip={trip} onRefresh={handleRefresh} />
                    ))}

                    {nextCursor && (
                        <Center mt="md">
                            <Button variant="light" onClick={handleLoadMore} loading={loadingMore}>
                                Load More
                            </Button>
                        </Center>
                    )}
                </Stack>
            )}
        </Stack>
    );
}
