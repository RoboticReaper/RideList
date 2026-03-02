import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/firebase/AuthContext';
import { getChicagoNow } from '@/utils/dateUtils';
import {
    TextInput, NumberInput, Button, Group, Stack, Container, Title, Paper, LoadingOverlay, ColorInput, SimpleGrid, Text, Modal, FileButton, Image, ActionIcon, Box
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCar, IconDeviceFloppy, IconTrash, IconPhoto, IconX } from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import { useTranslation } from 'react-i18next';
import { compressImage } from '@/utils/compressImage';

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

    // Car pictures: store as base64 (new upload) or URL string (existing)
    const [carPics, setCarPics] = useState<(string | null)[]>([
        initialData?.pic1 || null,
        initialData?.pic2 || null,
        initialData?.pic3 || null,
        initialData?.pic4 || null,
    ]);

    const handleCarPicUpload = async (file: File | null, index: number) => {
        if (!file) return;
        try {
            const compressedBase64 = await compressImage(file);
            setCarPics(prev => {
                const next = [...prev];
                next[index] = compressedBase64;
                return next;
            });
        } catch (error) {
            console.error('Image compression failed:', error);
            notifications.show({ title: t('rides.errors.errorTitle'), message: t('cars.form.notifications.saveError'), color: 'red' });
        }
    };

    const removeCarPic = (index: number) => {
        setCarPics(prev => {
            const next = [...prev];
            next[index] = null;
            return next;
        });
    };

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

            // 1. Upload any new base64 images individually first
            const uploadedUrls = [...carPics];
            for (let i = 0; i < uploadedUrls.length; i++) {
                const picData = uploadedUrls[i];
                if (picData && picData.startsWith('data:')) {
                    const uploadRes = await fetch('/api/user/cars/upload-image', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ image: picData })
                    });

                    if (!uploadRes.ok) {
                        throw new Error('Failed to upload image ' + (i + 1));
                    }

                    const uploadData = await uploadRes.json();
                    uploadedUrls[i] = uploadData.url;
                }
            }

            // 2. Submit the car data with the URLs
            const payload = {
                make,
                model,
                color,
                year: year === '' ? null : Number(year),
                plate,
                seats: Number(seats),
                big_luggage: Number(bigLuggage),
                small_luggage: Number(smallLuggage),
                pic1: uploadedUrls[0],
                pic2: uploadedUrls[1],
                pic3: uploadedUrls[2],
                pic4: uploadedUrls[3],
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
                            max={getChicagoNow().getFullYear() + 1}
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

                    <Text fw={600} mt="md">{t('cars.form.photos')}</Text>
                    <Text size="xs" c="dimmed">{t('cars.form.photosDesc')}</Text>
                    <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
                        {[0, 1, 2, 3].map((i) => (
                            <Box key={i} style={{ position: 'relative' }}>
                                {carPics[i] ? (
                                    <>
                                        <Image
                                            src={carPics[i]!}
                                            alt={`Car photo ${i + 1}`}
                                            radius="md"
                                            h={120}
                                            fit="cover"
                                        />
                                        <ActionIcon
                                            size="sm"
                                            color="red"
                                            variant="filled"
                                            style={{ position: 'absolute', top: 4, right: 4 }}
                                            onClick={() => removeCarPic(i)}
                                        >
                                            <IconX size={12} />
                                        </ActionIcon>
                                    </>
                                ) : (
                                    <FileButton onChange={(file) => handleCarPicUpload(file, i)} accept="image/*">
                                        {(props) => (
                                            <Button
                                                {...props}
                                                variant="light"
                                                color="gray"
                                                h={120}
                                                w="100%"
                                                styles={{ root: { border: '1px dashed var(--mantine-color-gray-4)' } }}
                                            >
                                                <Stack align="center" gap={4}>
                                                    <IconPhoto size={24} />
                                                    <Text size="xs">{t('cars.form.addPhoto')}</Text>
                                                </Stack>
                                            </Button>
                                        )}
                                    </FileButton>
                                )}
                            </Box>
                        ))}
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
