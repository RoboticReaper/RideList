import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/firebase/AuthContext';
import {
    TextInput, NumberInput, Button, Group, Stack, Container, Title, Paper, LoadingOverlay, ColorInput, SimpleGrid, Text, Modal
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCar, IconDeviceFloppy, IconTrash } from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';

interface CarFormProps {
    initialData?: any;
    isEditing?: boolean;
    carId?: string;
}

export default function CarForm({ initialData, isEditing = false, carId }: CarFormProps) {
    const { user } = useAuth();
    const router = useRouter();
    const [opened, { open, close }] = useDisclosure(false);
    const [loading, setLoading] = useState(false);

    const [make, setMake] = useState(initialData?.make || '');
    const [model, setModel] = useState(initialData?.model || '');
    const [color, setColor] = useState(initialData?.color || '');
    const [year, setYear] = useState<number | ''>(initialData?.year || '');
    const [plate, setPlate] = useState(initialData?.plate || '');
    const [seats, setSeats] = useState<number | ''>(initialData?.seats || 4);
    const [bigLuggage, setBigLuggage] = useState<number | ''>(initialData?.big_luggage || 2);
    const [smallLuggage, setSmallLuggage] = useState<number | ''>(initialData?.small_luggage || 2);

    const handleSubmit = async () => {
        if (!user) return;

        // Seats is required by DB schema (NOT NULL, > 0)
        if (!seats || Number(seats) <= 0) {
            notifications.show({ title: 'Error', message: 'Passenger Seats must be greater than 0', color: 'red' });
            return;
        }

        setLoading(true);
        try {
            const token = await user.getIdToken();
            const payload = {
                make,
                model,
                color,
                year: Number(year),
                plate,
                seats: Number(seats),
                big_luggage: Number(bigLuggage),
                small_luggage: Number(smallLuggage),
            };

            const url = isEditing ? `/api/user/cars/${carId}` : '/api/user/cars';
            const method = isEditing ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error('Failed to save car');

            notifications.show({ title: 'Success', message: 'Car saved successfully', color: 'green' });
            router.push('/cars');
            router.refresh();
        } catch (error) {
            console.error(error);
            notifications.show({ title: 'Error', message: 'Failed to save car', color: 'red' });
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!user || !carId) return;

        setLoading(true);
        try {
            const token = await user.getIdToken();
            const res = await fetch(`/api/user/cars/${carId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) throw new Error('Failed to delete car');

            notifications.show({ title: 'Success', message: 'Car deleted', color: 'blue' });
            router.push('/cars');
            router.refresh();
        } catch (error) {
            console.error(error);
            notifications.show({ title: 'Error', message: 'Failed to delete car', color: 'red' });
            setLoading(false);
            close();
        }
    };

    return (
        <Container size="md" py="xl">
            <Paper withBorder p="xl" radius="md" pos="relative">
                <LoadingOverlay visible={loading} />
                <Group justify="space-between" mb="lg">
                    <Title order={2}>{isEditing ? 'Edit Vehicle' : 'Add New Vehicle'}</Title>
                    {isEditing && (
                        <Button color="red" variant="subtle" leftSection={<IconTrash size={16} />} onClick={open}>
                            Delete
                        </Button>
                    )}
                </Group>

                <Stack gap="md">
                    <SimpleGrid cols={{ base: 1, sm: 2 }}>
                        <TextInput
                            label="Make"
                            placeholder="Toyota"
                            value={make}
                            onChange={(e) => setMake(e.currentTarget.value)}
                        />
                        <TextInput
                            label="Model"
                            placeholder="Camry"
                            value={model}
                            onChange={(e) => setModel(e.currentTarget.value)}
                        />
                    </SimpleGrid>

                    <SimpleGrid cols={{ base: 1, sm: 2 }}>
                        <TextInput
                            label="Color"
                            placeholder="Silver"
                            value={color}
                            onChange={(e) => setColor(e.currentTarget.value)}
                        />
                        <NumberInput
                            label="Year"
                            placeholder="2020"
                            value={year}
                            onChange={(v) => setYear(v === '' ? '' : Number(v))}
                            min={1990}
                            max={new Date().getFullYear() + 1}
                        />
                    </SimpleGrid>

                    <TextInput
                        label="License Plate"
                        placeholder="ABC-1234"
                        description="Used for riders to identify your vehicle."
                        value={plate}
                        onChange={(e) => setPlate(e.currentTarget.value)}
                    />

                    <Text fw={600} mt="md">Capacity</Text>
                    <SimpleGrid cols={{ base: 1, sm: 3 }}>
                        <NumberInput
                            label="Passenger Seats"
                            required
                            value={seats}
                            onChange={(v) => setSeats(v === '' ? '' : Number(v))}
                            min={1}
                            max={20}
                        />
                        <NumberInput
                            label="Big Luggage Capacity"
                            value={bigLuggage}
                            onChange={(v) => setBigLuggage(v === '' ? '' : Number(v))}
                            min={0}
                        />
                        <NumberInput
                            label="Small Luggage Capacity"
                            value={smallLuggage}
                            onChange={(v) => setSmallLuggage(v === '' ? '' : Number(v))}
                            min={0}
                        />
                    </SimpleGrid>

                    <Group justify="flex-end" mt="xl">
                        <Button variant="default" onClick={() => router.back()}>Cancel</Button>
                        <Button
                            leftSection={<IconDeviceFloppy size={16} />}
                            onClick={handleSubmit}
                            loading={loading}
                        >
                            Save Vehicle
                        </Button>
                    </Group>
                </Stack>
            </Paper>

            <Modal opened={opened} onClose={close} title="Confirm Deletion" centered>
                <Text size="sm" mb="lg">
                    Are you sure you want to delete this vehicle? This action cannot be undone.
                </Text>
                <Group justify="flex-end">
                    <Button variant="default" onClick={close}>Cancel</Button>
                    <Button color="red" onClick={handleDelete} loading={loading}>Delete Vehicle</Button>
                </Group>
            </Modal>
        </Container>
    );
}
