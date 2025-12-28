'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/firebase/AuthContext';
import { Container, Title, Button, Group, Paper, Text, Stack, Loader, Alert, ThemeIcon, Badge, Grid } from '@mantine/core';
import { IconPlus, IconCar, IconAlertCircle } from '@tabler/icons-react';
import { LocalizedLink } from '@/components/LocalizedLink';

export default function CarsPage() {
    const { user } = useAuth();
    const [cars, setCars] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!user) return;

        const fetchCars = async () => {
            try {
                const token = await user.getIdToken();
                const res = await fetch('/api/user/cars', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!res.ok) throw new Error('Failed to fetch cars');
                const data = await res.json();
                setCars(data.cars || []);
            } catch (err: any) {
                console.error(err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchCars();
    }, [user]);

    if (loading) return <Container py="xl"><Loader /></Container>;
    if (error) return <Container py="xl"><Alert color="red" icon={<IconAlertCircle />}>{error}</Alert></Container>;

    return (
        <Container size="md" py="xl">
            <Group justify="space-between" mb="lg">
                <Title order={2}>Your Cars</Title>
                <Button component={LocalizedLink} href="/cars/new" leftSection={<IconPlus size={16} />}>
                    Add New Car
                </Button>
            </Group>

            {cars.length === 0 ? (
                <Paper withBorder p="xl" ta="center">
                    <ThemeIcon size={64} radius="xl" color="gray" variant="light" mb="md">
                        <IconCar size={32} />
                    </ThemeIcon>
                    <Title order={3} mb="sm">No Cars Found</Title>
                    <Text c="dimmed" mb="lg">Add your first car to start creating trips.</Text>
                    <Button component={LocalizedLink} href="/cars/new" variant="outline">
                        Add Car
                    </Button>
                </Paper>
            ) : (
                <Stack>
                    {cars.map((car) => (
                        <Paper
                            key={car.id}
                            withBorder
                            p="md"
                            component={LocalizedLink}
                            href={`/cars/${car.id}`}
                            style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer', transition: 'box-shadow 0.2s' }}
                            // @ts-ignore
                            sx={{ '&:hover': { boxShadow: 'var(--mantine-shadow-xs)' } }}
                        >
                            <Group justify="space-between" align="center">
                                <Group gap="md">
                                    <ThemeIcon size="xl" radius="md" variant="light" color="blue">
                                        <IconCar size={24} />
                                    </ThemeIcon>
                                    <div>
                                        <Text fw={600} size="lg">{car.year} {car.make} {car.model}</Text>
                                        <Group gap="xs">
                                            <Badge color="gray" variant="outline" size="sm">{car.color}</Badge>
                                            <Text size="sm" c="dimmed">{car.plate}</Text>
                                        </Group>
                                    </div>
                                </Group>
                            </Group>
                        </Paper>
                    ))}
                </Stack>
            )}
        </Container>
    );
}
