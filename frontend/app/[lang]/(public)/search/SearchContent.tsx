'use client';

import { RidesSearch } from '@/components/Rides/RidesSearch';
import { Title, Container, Box, Loader, Center } from '@mantine/core';
import { RideList } from '@/components/Rides/RideList';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

export function SearchContent() {
    const { t } = useTranslation('common');
    const searchParams = useSearchParams();
    const [rides, setRides] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchRides = async () => {
            setLoading(true);
            const params = new URLSearchParams(searchParams.toString());
            try {
                const res = await fetch(`/api/rides/searchrides?${params.toString()}`, {
                    cache: 'no-store'
                });
                if (!res.ok) {
                    console.error('Failed to fetch rides');
                    setRides([]);
                } else {
                    const data = await res.json();
                    setRides(data.rides || []);
                }
            } catch (e) {
                console.error('Fetch error', e);
                setRides([]);
            } finally {
                setLoading(false);
            }
        };

        fetchRides();
    }, [searchParams]);

    // Convert ReadonlyURLSearchParams to the object format expected by RideList
    const rideListSearchParams: { [key: string]: string | string[] | undefined } = {};
    searchParams.forEach((value, key) => {
        const values = searchParams.getAll(key);
        if (values.length > 1) {
            rideListSearchParams[key] = values;
        } else {
            rideListSearchParams[key] = value;
        }
    });

    return (
        <Container size="lg" py="xl" w="100%">
            <Title order={2} mb="lg">{t('rides.search.title')}</Title>

            <Box mb="md" w="100%">
                <RidesSearch />
            </Box>

            <Box>
                {loading ? (
                    <Center p="xl">
                        <Loader />
                    </Center>
                ) : (
                    <RideList
                        initialRides={rides}
                        searchParams={rideListSearchParams}
                    />
                )}
            </Box>
        </Container>
    );
}
