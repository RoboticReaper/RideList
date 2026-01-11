'use client';
import { useState, useEffect, useRef } from 'react';
import { Button, TextInput, NumberInput, Group, Select, Stack, Paper, Title, Autocomplete, Loader, ActionIcon, Textarea, Text, Modal } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useRouter } from 'next/navigation';
import { IconDeviceFloppy, IconTrash, IconX } from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import { useAuth } from '@/components/firebase/AuthContext';
import { LocalizedLink } from '@/components/LocalizedLink';
import { useTranslation, Trans } from 'react-i18next';

interface TripTemplateFormProps {
    templateId?: string; // 'new' or uuid
    initialData?: any;
}

export function TripTemplateForm({ templateId, initialData }: TripTemplateFormProps) {
    const { t } = useTranslation('common');
    const { user } = useAuth();
    const router = useRouter();
    const isNew = templateId === 'new';

    // Form State
    const [name, setName] = useState(initialData?.name || '');
    const [notes, setNotes] = useState(initialData?.notes || '');
    const [price, setPrice] = useState<number | ''>(initialData?.price ? Number(initialData.price) : '');
    const [seats, setSeats] = useState<number | ''>(initialData?.total_seats || '');

    // Location
    const [startLocation, setStartLocation] = useState(initialData?.from_text || '');
    const [endLocation, setEndLocation] = useState(initialData?.to_text || '');
    const [startCoords, setStartCoords] = useState<{ lat: number, lng: number } | null>(
        initialData?.origin_lat ? { lat: initialData.origin_lat, lng: initialData.origin_lng } : null
    );
    const [endCoords, setEndCoords] = useState<{ lat: number, lng: number } | null>(
        initialData?.dest_lat ? { lat: initialData.dest_lat, lng: initialData.dest_lng } : null
    );

    // Location IDs
    const [startPlaceId, setStartPlaceId] = useState<string | null>(initialData?.from_place_id || null);
    const [endPlaceId, setEndPlaceId] = useState<string | null>(initialData?.to_place_id || null);

    // Car & Rule Refs
    const [selectedCar, setSelectedCar] = useState<string | null>(initialData?.car || null);
    const [selectedRule, setSelectedRule] = useState<string | null>(initialData?.rule || null);

    // Data Lists
    const [myCars, setMyCars] = useState<any[]>([]);
    const [myRules, setMyRules] = useState<any[]>([]);

    // Autocomplete State
    const [startSuggestions, setStartSuggestions] = useState<string[]>([]);
    const [endSuggestions, setEndSuggestions] = useState<string[]>([]);
    const [loadingStart, setLoadingStart] = useState(false);
    const [loadingEnd, setLoadingEnd] = useState(false);

    const predictionsMap = useRef<Map<string, string>>(new Map());
    const startSessionToken = useRef<string>(typeof crypto !== 'undefined' ? crypto.randomUUID() : '');
    const endSessionToken = useRef<string>(typeof crypto !== 'undefined' ? crypto.randomUUID() : '');

    const [opened, { open, close }] = useDisclosure(false);
    const [loading, setLoading] = useState(false);


    // Fetch Cars and Rules
    useEffect(() => {
        if (user) {
            user.getIdToken().then(token => {
                // Fetch Cars
                fetch('/api/user/cars', { headers: { 'Authorization': `Bearer ${token}` } })
                    .then(res => res.json())
                    .then(data => { if (data.cars) setMyCars(data.cars); });

                // Fetch Rule Templates
                fetch('/api/user/rule-templates', { headers: { 'Authorization': `Bearer ${token}` } })
                    .then(res => res.json())
                    .then(data => { if (data.templates) setMyRules(data.templates); });
            });
        }
    }, [user]);

    // --- Autocomplete Logic (Copied from TripInputBar) ---
    const fetchPlaces = async (query: string, setSuggestions: (data: string[]) => void, setLoading: (l: boolean) => void, sessionToken: string) => {
        if (!query || query.length < 3) {
            setSuggestions([]);
            return;
        }
        setLoading(true);
        try {
            const apiKey = process.env.NEXT_PUBLIC_PLACES_AUTOCOMPLETE!;
            const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': apiKey,
                },
                body: JSON.stringify({ input: query, sessionToken }),
            });
            const data = await response.json();
            const newSuggestions: string[] = [];
            (data.suggestions || []).forEach((item: any) => {
                const text = item.placePrediction.text.text;
                const id = item.placePrediction.placeId;
                newSuggestions.push(text);
                predictionsMap.current.set(text, id);
            });
            setSuggestions(newSuggestions);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const debounceTimeout = useRef<NodeJS.Timeout | null>(null);
    const debounceFetch = (query: string, setSuggestions: (data: string[]) => void, setLoading: (l: boolean) => void, sessionToken: string) => {
        if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
        debounceTimeout.current = setTimeout(() => {
            fetchPlaces(query, setSuggestions, setLoading, sessionToken);
        }, 300);
    };

    const handleStartChange = (val: string) => {
        setStartLocation(val);
        debounceFetch(val, setStartSuggestions, setLoadingStart, startSessionToken.current);
    };
    const handleEndChange = (val: string) => {
        setEndLocation(val);
        debounceFetch(val, setEndSuggestions, setLoadingEnd, endSessionToken.current);
    };

    // Geocoding Helper
    const geocode = async (placeId: string, sessionToken: string): Promise<{ lat: number, lng: number } | null> => {
        try {
            const apiKey = process.env.NEXT_PUBLIC_PLACES_AUTOCOMPLETE!;
            const response = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': apiKey,
                    'X-Goog-FieldMask': 'location',
                },
            });
            const data = await response.json();
            if (data.location) {
                return { lat: data.location.latitude, lng: data.location.longitude };
            }
        } catch (e) { console.error(e); }
        return null; // Should handle this better
    };

    // On Submit
    const handleSubmit = async () => {
        if (!name.trim()) {
            notifications.show({ title: t('rides.errors.errorTitle'), message: t('templates.trips.form.notifications.nameRequired'), color: 'red' });
            return;
        }

        setLoading(true);
        try {
            let sCoords = startCoords;
            let eCoords = endCoords;

            // Determine Start Place ID
            let finalStartId = predictionsMap.current.get(startLocation);
            // If user didn't change location (text matches initial), keep initial ID. If text changed but not in map (e.g. slight edit), lose ID?
            // Safer: if predictionsMap has it, use it. Else if text == initial text, use initial ID. Else null.
            if (!finalStartId && startLocation === initialData?.from_text) {
                finalStartId = startPlaceId || undefined;
            }

            if (finalStartId) {
                // If we have a new ID (from map), re-geocode to be safe/sure
                if (predictionsMap.current.has(startLocation)) {
                    const c = await geocode(finalStartId, startSessionToken.current);
                    if (c) sCoords = c;
                }
            }

            // Determine End Place ID
            let finalEndId = predictionsMap.current.get(endLocation);
            if (!finalEndId && endLocation === initialData?.to_text) {
                finalEndId = endPlaceId || undefined;
            }

            if (finalEndId) {
                if (predictionsMap.current.has(endLocation)) {
                    const c = await geocode(finalEndId, endSessionToken.current);
                    if (c) eCoords = c;
                }
            }

            const token = await user?.getIdToken();
            const payload = {
                name,
                notes,
                price: price === '' ? null : price,
                total_seats: seats === '' ? null : seats,
                from_text: startLocation,
                to_text: endLocation,
                from_place_id: finalStartId || null,
                to_place_id: finalEndId || null,
                origin_lat: sCoords?.lat,
                origin_lng: sCoords?.lng,
                dest_lat: eCoords?.lat,
                dest_lng: eCoords?.lng,
                car_id: selectedCar === 'none' ? null : selectedCar,
                rule_id: selectedRule === 'none' || selectedRule === '' ? null : selectedRule
            };

            const url = isNew ? '/api/user/trip-templates' : `/api/user/trip-templates/${templateId}`;
            const method = isNew ? 'POST' : 'PUT';

            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error('Failed to save template');

            notifications.show({ title: t('rides.errors.successTitle'), message: t('templates.trips.form.notifications.saveSuccess'), color: 'green' });
            router.push('/trip-templates');

        } catch (error) {
            console.error(error);
            notifications.show({ title: t('rides.errors.errorTitle'), message: t('templates.trips.form.notifications.saveError'), color: 'red' });
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        setLoading(true);
        try {
            const token = await user?.getIdToken();
            await fetch(`/api/user/trip-templates/${templateId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            router.push('/trip-templates');
        } catch (error) {
            console.error(error);
            notifications.show({ title: t('rides.errors.errorTitle'), message: t('templates.trips.form.notifications.deleteError'), color: 'red' });
            setLoading(false);
            close();
        }
    };

    return (
        <Stack gap="md" maw={800} mx="auto">
            <Group justify="space-between">
                <Title order={3}>{isNew ? t('templates.trips.form.addTitle') : t('templates.trips.form.editTitle')}</Title>
                {!isNew && (
                    <Button color="red" variant="subtle" leftSection={<IconTrash size={16} />} onClick={open} loading={loading}>
                        {t('templates.trips.form.delete')}:
                    </Button>
                )}
            </Group>

            <TextInput
                label={t('templates.trips.form.name')}
                placeholder={t('templates.trips.form.namePlaceholder')}
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
            />

            <Textarea
                label={t('templates.trips.form.driverNotes')}
                description={t('templates.trips.form.driverNotesDesc')}
                placeholder={t('templates.trips.form.driverNotesPlaceholder')}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
            />

            <Paper withBorder p="md" radius="md">
                <Title order={4} mb="md">{t('templates.trips.form.sectionRoute')}</Title>
                <Stack>
                    <Autocomplete
                        label={t('templates.trips.form.from')}
                        placeholder={t('templates.trips.form.fromPlaceholder')}
                        data={startSuggestions}
                        value={startLocation}
                        onChange={handleStartChange}
                        rightSection={loadingStart ? <Loader size="xs" /> : (startLocation && <ActionIcon variant="subtle" onClick={() => setStartLocation('')}><IconX size={14} /></ActionIcon>)}
                    />
                    <Autocomplete
                        label={t('templates.trips.form.to')}
                        placeholder={t('templates.trips.form.toPlaceholder')}
                        data={endSuggestions}
                        value={endLocation}
                        onChange={handleEndChange}
                        rightSection={loadingEnd ? <Loader size="xs" /> : (endLocation && <ActionIcon variant="subtle" onClick={() => setEndLocation('')}><IconX size={14} /></ActionIcon>)}
                    />

                    <Group grow>
                        <NumberInput label={t('templates.trips.form.price')} value={price} onChange={(val) => setPrice(val === '' ? '' : Number(val))} min={0} />
                        <NumberInput label={t('templates.trips.form.totalSeats')} value={seats} onChange={(val) => setSeats(val === '' ? '' : Number(val))} min={1} />
                    </Group>

                    <Select
                        label={t('templates.trips.form.vehicle')}
                        placeholder={t('templates.trips.form.vehiclePlaceholder')}
                        data={[
                            { value: 'none', label: t('templates.trips.form.noVehicle') },
                            ...myCars.map(c => ({ value: c.id, label: `${c.make} ${c.model}` }))
                        ]}
                        value={selectedCar}
                        onChange={setSelectedCar}
                        searchable
                        clearable
                    />
                    <Text size="xs" c="dimmed" mt={-10}>
                        <Trans i18nKey="templates.trips.form.vehicleHelp" components={{ 1: <LocalizedLink href="/cars" style={{ textDecoration: 'underline' }} /> }} />
                    </Text>

                    <Select
                        label={t('templates.trips.form.ruleTemplate')}
                        placeholder={t('templates.trips.form.ruleTemplatePlaceholder')}
                        data={[
                            { value: 'none', label: t('templates.trips.form.noRules') },
                            ...myRules.map(r => ({ value: r.id, label: r.name }))
                        ]}
                        value={selectedRule}
                        onChange={setSelectedRule}
                        searchable
                        clearable
                        description={t('templates.trips.form.ruleTemplateDesc')}
                    />

                </Stack>
            </Paper>

            <Button leftSection={<IconDeviceFloppy size={16} />} onClick={handleSubmit} loading={loading}>
                {t('templates.trips.form.save')}
            </Button>

            <Modal opened={opened} onClose={close} title={t('templates.trips.form.modals.deleteTitle')} centered>
                <Text size="sm" mb="lg">
                    {t('templates.trips.form.modals.deleteMessage')}
                </Text>
                <Group justify="flex-end">
                    <Button variant="default" onClick={close}>{t('templates.trips.form.cancel')}</Button>
                    <Button color="red" onClick={handleDelete} loading={loading}>{t('templates.trips.form.modals.confirmDelete')}</Button>
                </Group>
            </Modal>
        </Stack>
    );
}
