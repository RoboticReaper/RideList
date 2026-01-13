import { RidesSearch } from '@/components/Rides/RidesSearch';
import { Title, Container, Box } from '@mantine/core';
import { useServerTranslation } from '@/app/i18n/server';
import { RideList } from '@/components/Rides/RideList';

import { Metadata } from 'next';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
    const { lang } = await params;
    const { t } = await useServerTranslation(lang, 'common');
    return {
        title: t('metadata.search.title'),
        description: t('metadata.search.description'),
    };
}

async function getRides(searchParams: any) {
    const params = new URLSearchParams();
    if (searchParams) {
        Object.entries(searchParams).forEach(([key, value]) => {
            if (typeof value === 'string') {
                params.append(key, value);
            } else if (Array.isArray(value)) {
                value.forEach((v) => params.append(key, v));
            }
        });
    }
    const query = params.toString();
    try {
        const res = await fetch(`http://localhost:3000/api/rides/search?${query}`, {
            cache: 'no-store'
        });
        if (!res.ok) {
            console.error('Failed to fetch rides', await res.text());
            return [];
        }
        const data = await res.json();
        return data.rides || [];
    } catch (e) {
        console.error('Fetch error', e);
        return [];
    }
}

export default async function RidesPage({
    searchParams,
    params,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
    params: Promise<{ lang: string }>;
}) {
    const resolvedSearchParams = await searchParams;
    const { lang } = await params;
    const { t } = await useServerTranslation(lang, 'common');
    const rides = await getRides(resolvedSearchParams);

    return (
        <Container size="lg" py="xl" w="100%">
            <Title order={2} mb="lg">{t('rides.search.title')}</Title>

            <Box mb="md" w="100%">
                <RidesSearch />
            </Box>

            <Box>
                <RideList
                    initialRides={rides}
                    searchParams={resolvedSearchParams || {}}
                />
            </Box>
        </Container>
    );
}