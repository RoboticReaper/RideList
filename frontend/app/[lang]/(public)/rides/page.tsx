import { RidesSearch } from '@/components/Rides/RidesSearch';
import { RideCard } from '@/components/Rides/RideCard';
import { Title, Container, Box, Text, Stack } from '@mantine/core';

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
        console.log(data);
        return data.rides || [];
    } catch (e) {
        console.error('Fetch error', e);
        return [];
    }
}

export default async function RidesPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const resolvedSearchParams = await searchParams;
    const rides = await getRides(resolvedSearchParams);

    return (
        <Container size="lg" py="xl" w="100%">
            <Title order={2} mb="lg">Find a Ride</Title>

            <Box mb="md" w="100%">
                <RidesSearch />
            </Box>

            <Box>
                {rides.length === 0 ? (
                    <Text c="dimmed" fs="italic">No rides found matching your criteria.</Text>
                ) : (
                    <Stack>
                        {rides.map((ride: any) => (
                            <RideCard key={ride.id} ride={ride} />
                        ))}
                    </Stack>
                )}
            </Box>
        </Container>
    );
}