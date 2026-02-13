'use client'
import { RideCard } from '@/components/Rides/RideCard';
import { Stack, Button, Center, Text } from '@mantine/core'; // Removed Loader
import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { ComponentProps } from 'react';

type Ride = ComponentProps<typeof RideCard>['ride'];

interface RideListProps {
    initialRides: Ride[];
    searchParams: { [key: string]: string | string[] | undefined };
    onPostRequest: () => void;
}

export function RideList({ initialRides, searchParams, onPostRequest }: RideListProps) {
    const { t } = useTranslation('common');
    const [rides, setRides] = useState<Ride[]>(initialRides);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [hasMore, setHasMore] = useState(initialRides.length >= 10);

    // Reset state when search params change (except page)
    useEffect(() => {
        setRides(initialRides);
        setPage(1);
        setHasMore(initialRides.length >= 10);
    }, [initialRides]);

    const loadMore = async () => {
        setLoading(true);
        const nextPage = page + 1;
        const params = new URLSearchParams();

        Object.entries(searchParams).forEach(([key, value]) => {
            if (typeof value === 'string') {
                params.append(key, value);
            } else if (Array.isArray(value)) {
                value.forEach((v) => params.append(key, v));
            }
        });

        params.set('page', nextPage.toString());

        try {
            const res = await fetch(`/api/rides/searchrides?${params.toString()}`);
            if (!res.ok) throw new Error('Failed to fetch');
            const data = await res.json();

            if (data.rides && data.rides.length > 0) {
                setRides(prev => [...prev, ...data.rides]);
                setPage(nextPage);
                setHasMore(data.rides.length >= 10);
            } else {
                setHasMore(false);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Stack>
            {rides.length === 0 ? (
                <Text c="dimmed" fs="italic" ta="center" py="xl">{t('rides.search.noResults')}</Text>
            ) : (
                <>
                    <Stack>
                        {rides.map((ride) => (
                            <RideCard key={`${ride.id}-${ride.driver_name}`} ride={ride} />
                        ))}
                    </Stack>

                    {hasMore && (
                        <Center mt="md">
                            <Button
                                variant="light"
                                onClick={loadMore}
                                loading={loading}
                            >
                                {t('rides.search.loadMore')}
                            </Button>
                        </Center>
                    )}
                </>
            )}

            {/* Post Request Prompt */}
            <Stack align="center" gap={4} py="xl" mt="md">
                <Text size="sm" c="dimmed">
                    {t('rides.search.postRequestPrompt')}
                </Text>
                <Button
                    variant="subtle"
                    size="sm"
                    onClick={onPostRequest}
                >
                    {t('rides.rideRequests.postRequest')}
                </Button>
            </Stack>
        </Stack>
    );
}
