import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/firebase/AuthContext';
import {
    TextInput, NumberInput, Button, Group, Stack, Container, Title, Paper, LoadingOverlay, ColorInput, SimpleGrid, Text, Modal
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCar, IconDeviceFloppy, IconTrash } from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import { useTranslation } from 'react-i18next';

interface CarFormProps {
    initialData?: any;
    isEditing?: boolean;
    carId?: string;
}

export default function CarForm({ initialData, isEditing = false, carId }: CarFormProps) {
    const { t } = useTranslation('common');
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
            notifications.show({ title: t('rides.errors.errorTitle'), message: t('cars.form.notifications.seatsError'), color: 'red' });
            return;
        }

        setLoading(true);
        try {
            const token = await user.getIdToken();
            const payload = {
                make,
                model,
                color,
                year: year === '' ? null : Number(year),
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

            notifications.show({ title: t('rides.errors.successTitle'), message: t('cars.form.notifications.saveSuccess'), color: 'green' });
            router.push('/cars');
            router.refresh();
        } catch (error) {
            console.error(error);
            notifications.show({ title: t('rides.errors.errorTitle'), message: t('cars.form.notifications.saveError'), color: 'red' });
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

            notifications.show({ title: t('rides.errors.successTitle'), message: t('cars.form.notifications.deleteSuccess'), color: 'blue' });
            router.push('/cars');
            router.refresh();
        } catch (error) {
            console.error(error);
            notifications.show({ title: t('rides.errors.errorTitle'), message: t('cars.form.notifications.deleteError'), color: 'red' });
            setLoading(false);
            close();
        }
    };

    return (
        <Container size="md" py="xl">
            <Paper withBorder p="xl" radius="md" pos="relative">
                <LoadingOverlay visible={loading} />
                <Group justify="space-between" mb="lg">
                    <Title order={2}>{isEditing ? t('cars.form.editTitle') : t('cars.form.addTitle')}</Title>
                    {isEditing && (
                        <Button color="red" variant="subtle" leftSection={<IconTrash size={16} />} onClick={open}>
                            {t('cars.form.delete')}
                        </Button>
                    )}
                </Group>

                <Stack gap="md">
                    <SimpleGrid cols={{ base: 1, sm: 2 }}>
                        <TextInput
                            label={t('cars.form.make')}
                            placeholder={t('cars.form.makePlaceholder')}
                            value={make}
                            onChange={(e) => setMake(e.currentTarget.value)}
                        />
                        <TextInput
                            label={t('cars.form.model')}
                            placeholder={t('cars.form.modelPlaceholder')}
                            value={model}
                            onChange={(e) => setModel(e.currentTarget.value)}
                        />
                    </SimpleGrid>

                    <SimpleGrid cols={{ base: 1, sm: 2 }}>
                        <TextInput
                            label={t('cars.form.color')}
                            placeholder={t('cars.form.colorPlaceholder')}
                            value={color}
                            onChange={(e) => setColor(e.currentTarget.value)}
                        />
                        <NumberInput
                            label={t('cars.form.year')}
                            placeholder="2020"
                            value={year}
                            onChange={(v) => setYear(v === '' ? '' : Number(v))}
                            min={1990}
                            max={new Date().getFullYear() + 1}
                        />
                    </SimpleGrid>

                    <TextInput
                        label={t('cars.form.plate')}
                        placeholder={t('cars.form.platePlaceholder')}
                        description={t('cars.form.plateDesc')}
                        value={plate}
                        onChange={(e) => setPlate(e.currentTarget.value)}
                    />

                    <Text fw={600} mt="md">{t('cars.form.capacity')}</Text>
                    <SimpleGrid cols={{ base: 1, sm: 3 }}>
                        <NumberInput
                            label={t('cars.form.seats')}
                            required
                            value={seats}
                            onChange={(v) => setSeats(v === '' ? '' : Number(v))}
                            min={1}
                            max={20}
                        />
                        <NumberInput
                            label={t('cars.form.bigLuggage')}
                            value={bigLuggage}
                            onChange={(v) => setBigLuggage(v === '' ? '' : Number(v))}
                            min={0}
                        />
                        <NumberInput
                            label={t('cars.form.smallLuggage')}
                            value={smallLuggage}
                            onChange={(v) => setSmallLuggage(v === '' ? '' : Number(v))}
                            min={0}
                        />
                    </SimpleGrid>

                    <Group justify="flex-end" mt="xl">
                        <Button variant="default" onClick={() => router.back()}>{t('cars.form.cancel')}</Button>
                        <Button
                            leftSection={<IconDeviceFloppy size={16} />}
                            onClick={handleSubmit}
                            loading={loading}
                        >
                            {t('cars.form.save')}
                        </Button>
                    </Group>
                </Stack>
            </Paper>

            <Modal opened={opened} onClose={close} title={t('cars.form.modals.deleteTitle')} centered>
                <Text size="sm" mb="lg">
                    {t('cars.form.modals.deleteMessage')}
                </Text>
                <Group justify="flex-end">
                    <Button variant="default" onClick={close}>{t('cars.form.cancel')}</Button>
                    <Button color="red" onClick={handleDelete} loading={loading}>{t('cars.form.modals.confirmDelete')}</Button>
                </Group>
            </Modal>
        </Container>
    );
}
