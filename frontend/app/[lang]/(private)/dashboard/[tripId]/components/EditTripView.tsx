import { useState, useEffect, useRef } from 'react';
import { Button, NumberInput, Stack, Textarea, Group, Switch, Select, Alert, MultiSelect, SimpleGrid, Title, Divider, Autocomplete, Loader, ActionIcon, TextInput, TagsInput, Accordion, Text, Anchor } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { DateTimePicker } from '@mantine/dates';
import { useAuth } from '@/components/firebase/AuthContext';
import { IconCheck, IconAlertTriangle, IconCalendar, IconCar, IconMapPin, IconCurrencyDollar, IconScript, IconX, IconLock } from '@tabler/icons-react';
import { parseFlexibility, parsePayWindow, parseCutoffTimeNullable, parseStartCheckInNullable, parseFlexibilityNullable, parseCutoffTime } from '@/utils/intervalParsers';
import { LocalizedLink } from '@/components/LocalizedLink';
import { RadiusMap } from '@/components/Rides/RadiusMap';
import { useTranslation, Trans } from 'react-i18next';

interface EditTripViewProps {
    trip: any; // Using any for simplicity as Trip type is large
    manualRefreshId: number;
}

interface Car {
    id: string;
    make: string;
    model: string;
    color?: string;
    year?: string;
    plate?: string;
    seats?: number;
    big_luggage?: number;
    small_luggage?: number;
}

// Type for Place Prediction from New API
interface PlacePrediction {
    placePrediction: {
        placeId: string;
        text: {
            text: string;
        };
        structuredFormat: {
            mainText: { text: string };
            secondaryText?: { text: string };
        };
    };
}

export function EditTripView({ trip, manualRefreshId }: EditTripViewProps) {
    const { t } = useTranslation('common');
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);

    // Car fetching
    const [cars, setCars] = useState<Car[]>([]);
    const [loadingCars, setLoadingCars] = useState(false);

    // --- Autocomplete State ---
    const [startSuggestions, setStartSuggestions] = useState<string[]>([]);
    const [endSuggestions, setEndSuggestions] = useState<string[]>([]);
    const [loadingStart, setLoadingStart] = useState(false);
    const [loadingEnd, setLoadingEnd] = useState(false);

    // Explicit state for Place IDs (null if not selected from dropdown or initial)
    const [startPlaceId, setStartPlaceId] = useState<string | null>(null);
    const [endPlaceId, setEndPlaceId] = useState<string | null>(null);

    const startSessionToken = useRef<string>(typeof crypto !== 'undefined' ? crypto.randomUUID() : '');
    const endSessionToken = useRef<string>(typeof crypto !== 'undefined' ? crypto.randomUUID() : '');
    const predictionsMap = useRef<Map<string, string>>(new Map());

    const debounceTimeout = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (user) {
            setLoadingCars(true);
            user.getIdToken().then(token => {
                fetch('/api/user/cars', {
                    headers: { 'Authorization': `Bearer ${token}` }
                })
                    .then(res => res.json())
                    .then(data => {
                        if (data.cars) setCars(data.cars);
                    })
                    .catch(console.error)
                    .finally(() => setLoadingCars(false));
            });
        }
    }, [user]);



    const mapTripToValues = (t: any) => ({
        // Trip Details
        from_input_text: t.from_input_text || '',
        to_input_text: t.to_input_text || '',
        departure_time: t.departure_time ? new Date(t.departure_time) : null,
        price: Number(t.price),
        total_seats: Number(t.seats.total),
        car: t.car?.id || 'none', // 'none' means no car/walking

        // Trip Note
        notes: t.notes || '',

        // Logistics / Rules
        paymentMethods: t.rules.payment.methods || [],
        paymentHandle: t.rules.payment.handle || '',
        cancellationPolicy: t.rules.cancellation_policy || '',

        bigLuggage: Number(t.rules.luggage.big ?? 0),
        smallLuggage: Number(t.rules.luggage.small ?? 0),

        pickupRules: t.rules.pickup.rules || '',
        pickupRadius: Number(t.rules.pickup.radius ?? 5000),
        dropoffRadius: Number(t.rules.pickup.dropoff_radius ?? 5000),

        flexibility: parseFlexibility(t.rules.flexibility),
        autoAccept: t.rules.auto_accept,

        // Cutoff
        cutoffEnabled: parseCutoffTimeNullable(t.rules.cutoff_time) !== null,
        cutoffTime: parseCutoffTimeNullable(t.rules.cutoff_time),

        payWindow: parsePayWindow(t.rules.pay_window),

        // Check-in
        startCheckInEnabled: parseStartCheckInNullable(t.rules.start_check_in_hrs) !== null,
        startCheckInHrs: parseStartCheckInNullable(t.rules.start_check_in_hrs) ?? 3,
    });

    const form = useForm({
        initialValues: mapTripToValues(trip),
    });

    const prevManualRefreshId = useRef(manualRefreshId);

    useEffect(() => {
        // If manualRefreshId changed, FORCE update (overwrite dirty state)
        if (manualRefreshId !== prevManualRefreshId.current) {
            const newValues = mapTripToValues(trip);
            form.setValues(newValues);
            form.setInitialValues(newValues); // reset dirty state
            form.resetDirty();
            prevManualRefreshId.current = manualRefreshId;
        } else {
            // Auto-refresh: Only update if form is clean
            if (!form.isDirty()) {
                const newValues = mapTripToValues(trip);
                form.setValues(newValues);
                form.setInitialValues(newValues);
                // No need to reset dirty, as it was already clean
            }
        }
    }, [trip, manualRefreshId]);





    // --- Autocomplete Logic ---
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
                body: JSON.stringify({
                    input: query,
                    sessionToken: sessionToken
                }),
            });

            if (!response.ok) {
                console.error("Places API error", await response.text());
                setLoading(false);
                return;
            }

            const data = await response.json();
            const newSuggestions: string[] = [];
            const seenTexts = new Set<string>();

            (data.suggestions || []).forEach((item: PlacePrediction) => {
                const text = item.placePrediction.text.text;
                const id = item.placePrediction.placeId;

                if (!seenTexts.has(text)) {
                    seenTexts.add(text);
                    newSuggestions.push(text);
                    predictionsMap.current.set(text, id);
                }
            });

            setSuggestions(newSuggestions);
        } catch (error) {
            console.error("Failed to fetch places", error);
        } finally {
            setLoading(false);
        }
    };

    const debounceFetch = (query: string, setSuggestions: (data: string[]) => void, setLoading: (l: boolean) => void, sessionToken: string) => {
        if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
        debounceTimeout.current = setTimeout(() => {
            fetchPlaces(query, setSuggestions, setLoading, sessionToken);
        }, 300);
    };

    const handleStartChange = (val: string) => {
        form.setFieldValue('from_input_text', val);

        // Check if the typed/selected value matches a known prediction
        const knownId = predictionsMap.current.get(val);
        if (knownId) {
            setStartPlaceId(knownId);
        } else {
            setStartPlaceId(null);
            if (!startSessionToken.current) startSessionToken.current = crypto.randomUUID();
            debounceFetch(val, setStartSuggestions, setLoadingStart, startSessionToken.current);
        }
    };

    const handleEndChange = (val: string) => {
        form.setFieldValue('to_input_text', val);

        const knownId = predictionsMap.current.get(val);
        if (knownId) {
            setEndPlaceId(knownId);
        } else {
            setEndPlaceId(null);
            if (!endSessionToken.current) endSessionToken.current = crypto.randomUUID();
            debounceFetch(val, setEndSuggestions, setLoadingEnd, endSessionToken.current);
        }
    };

    // Clear handlers
    const clearStart = () => {
        form.setFieldValue('from_input_text', '');
        setStartPlaceId(null);
        setStartSuggestions([]);
        startSessionToken.current = crypto.randomUUID();
    };

    const clearEnd = () => {
        form.setFieldValue('to_input_text', '');
        setEndPlaceId(null);
        setEndSuggestions([]);
        endSessionToken.current = crypto.randomUUID();
    };

    const renderRightSection = (loading: boolean, value: string, onClear: () => void) => {
        if (loading) return <Loader size="xs" />;
        if (value) {
            return (
                <ActionIcon variant="transparent" color="gray" onClick={onClear}>
                    <IconX size={16} />
                </ActionIcon>
            );
        }
        return null;
    };


    const handleSubmit = async (values: typeof form.values) => {
        if (!user) return;

        // VALIDATION: Ensure From/To are not empty
        if (!values.from_input_text?.trim()) {
            notifications.show({ title: t('tripDetails.edit.notifications.missingStart.title'), message: t('tripDetails.edit.notifications.missingStart.message'), color: 'red' });
            return;
        }
        if (!values.to_input_text?.trim()) {
            notifications.show({ title: t('tripDetails.edit.notifications.missingDest.title'), message: t('tripDetails.edit.notifications.missingDest.message'), color: 'red' });
            return;
        }

        // VALIDATION: Ensure From/To are valid Place IDs if changed
        if (form.isDirty('from_input_text')) {
            if (!startPlaceId) {
                notifications.show({ title: t('tripDetails.edit.notifications.invalidStart.title'), message: t('tripDetails.edit.notifications.invalidStart.message'), color: 'red' });
                return;
            }
        }
        if (form.isDirty('to_input_text')) {
            if (!endPlaceId) {
                notifications.show({ title: t('tripDetails.edit.notifications.invalidDest.title'), message: t('tripDetails.edit.notifications.invalidDest.message'), color: 'red' });
                return;
            }
        }

        // VALIDATION: Database NOT NULL checks
        if (!values.departure_time) {
            notifications.show({ title: t('tripDetails.edit.notifications.missingDeparture.title'), message: t('tripDetails.edit.notifications.missingDeparture.message'), color: 'red' });
            return;
        }

        if (values.departure_time < new Date()) {
            notifications.show({ title: t('tripDetails.edit.notifications.invalidDeparture.title'), message: t('tripDetails.edit.notifications.invalidDeparture.message'), color: 'red' });
            return;
        }

        // total_seats > 0
        if (!values.total_seats || values.total_seats < 1) {
            notifications.show({ title: t('tripDetails.edit.notifications.invalidSeats.title'), message: t('tripDetails.edit.notifications.invalidSeats.message'), color: 'red' });
            return;
        }

        // Validate Price (Must be number >= 0, not empty)
        // Check for undefined, null, or empty string (though initialValues casts to Number, clearing input might make it '')
        if ((values.price as any) === '' || values.price === undefined || values.price === null || Number(values.price) < 0) {
            notifications.show({ title: t('tripDetails.edit.notifications.invalidPrice.title'), message: t('tripDetails.edit.notifications.invalidPrice.message'), color: 'red' });
            return;
        }


        // pickup/dropoff radius > 0 (DB check: > 0)
        // Although DB default is 5000, form might send 0 or empty?
        // NumberInput with empty value sends '' or 0? 
        // We cast to Number() in initialValues, but onChange handles it. 
        if (!values.pickupRadius || values.pickupRadius <= 0) {
            notifications.show({ title: t('tripDetails.edit.notifications.invalidPickupRadius.title'), message: t('tripDetails.edit.notifications.invalidPickupRadius.message'), color: 'red' });
            return;
        }
        if (!values.dropoffRadius || values.dropoffRadius <= 0) {
            notifications.show({ title: t('tripDetails.edit.notifications.invalidDropoffRadius.title'), message: t('tripDetails.edit.notifications.invalidDropoffRadius.message'), color: 'red' });
            return;
        }

        // flexibility (interval not null) - Logic allows 0?
        // DB says: departure_time_flexibility interval not null default interval '15 minutes'
        // Intervals can be 0.
        // But let's ensure it's not empty text if that's possible.
        // It's a number input. 0 is valid "no flexibility".
        if ((values.flexibility as any) === '' || values.flexibility === undefined || values.flexibility === null) {
            notifications.show({ title: t('tripDetails.edit.notifications.invalidFlexibility.title'), message: t('tripDetails.edit.notifications.invalidFlexibility.message'), color: 'red' });
            return;
        }

        // Validate Capacity against Car
        if (values.car !== 'none') {
            const selectedCar = cars.find(c => c.id === values.car);
            if (selectedCar) {
                // Check Seats
                if ((selectedCar.seats || 0) > 0 && Number(values.total_seats) > (selectedCar.seats || 0)) {
                    notifications.show({
                        title: t('tripDetails.edit.notifications.capacityExceeded.title'),
                        message: t('tripDetails.edit.notifications.capacityExceeded.message', { total: values.total_seats, capacity: selectedCar.seats }),
                        color: 'red'
                    });
                    return;
                }

                // Check Luggage (if car has limits)
                if (selectedCar.big_luggage !== undefined && selectedCar.big_luggage !== null) {
                    if (Number(values.bigLuggage || 0) > selectedCar.big_luggage) {
                        notifications.show({
                            title: t('tripDetails.edit.notifications.bigLuggageExceeded.title'),
                            message: t('tripDetails.edit.notifications.bigLuggageExceeded.message', { limit: values.bigLuggage, capacity: selectedCar.big_luggage }),
                            color: 'yellow',
                            autoClose: false,
                        });
                    }
                }
                if (selectedCar.small_luggage !== undefined && selectedCar.small_luggage !== null) {
                    if (Number(values.smallLuggage || 0) > selectedCar.small_luggage) {
                        notifications.show({
                            title: t('tripDetails.edit.notifications.smallLuggageExceeded.title'),
                            message: t('tripDetails.edit.notifications.smallLuggageExceeded.message', { limit: values.smallLuggage, capacity: selectedCar.small_luggage }),
                            color: 'yellow',
                            autoClose: false,
                        });
                    }
                }
            }
        }

        setLoading(true);

        try {
            const payload: any = { ...values };

            // Attach Place IDs and Session Tokens if changed/available
            if (startPlaceId) {
                payload.from_place_id = startPlaceId;
                payload.from_session_token = startSessionToken.current;
            }
            if (endPlaceId) {
                payload.to_place_id = endPlaceId;
                payload.to_session_token = endSessionToken.current;
            }

            if (values.cutoffEnabled && (values.cutoffTime as any) !== '' && values.cutoffTime !== null) {
                payload.cutoffTime = `${values.cutoffTime} hours`;
            } else {
                payload.cutoffTime = 0; // Explicit 0 if disabled
            }

            if ((values.payWindow as any) !== '' && values.payWindow !== null) {
                payload.payWindow = `${values.payWindow} minutes`;
            } else {
                payload.payWindow = '60 minutes';
            }

            if (values.startCheckInEnabled && (values.startCheckInHrs as any) !== '' && values.startCheckInHrs !== null) {
                payload.startCheckInHrs = `${values.startCheckInHrs} hours`;
            } else {
                payload.startCheckInHrs = null;
            }

            if ((values.flexibility as any) !== '' && values.flexibility !== null) {
                payload.flexibility = `${values.flexibility} hours`;
            } else {
                payload.flexibility = '15 minutes';
            }

            if (payload.car === 'none') {
                delete payload.car;
            }

            const token = await user.getIdToken();
            const res = await fetch(`/api/trips/${trip.id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || t('tripDetails.edit.notifications.updateFailed'));
            }

            notifications.show({
                title: t('tripDetails.edit.notifications.success.title'),
                message: t('tripDetails.edit.notifications.success.message'),
                color: 'green',
                icon: <IconCheck size={16} />
            });
        } catch (error: any) {
            notifications.show({
                title: t('tripDetails.edit.notifications.error.title'),
                message: error.message,
                color: 'red',
                icon: <IconAlertTriangle size={16} />
            });
        } finally {
            setLoading(false);
        }
    };

    const isReadOnly = trip.status === 'cancelled' || trip.status === 'done' || trip.status === 'aborted';

    return (
        <form onSubmit={form.onSubmit(handleSubmit)}>
            <Stack gap="lg" maw={800} mx="auto">
                {isReadOnly ? (
                    <Alert title={t('tripDetails.edit.alerts.readOnly.title')} color="gray" icon={<IconLock size={16} />}>
                        {trip.status === 'done' ? t('tripDetails.edit.alerts.readOnly.completed') : t('tripDetails.edit.alerts.readOnly.cancelled')}
                    </Alert>
                ) : (
                    <Alert title={t('tripDetails.edit.alerts.editingMode.title')} color="blue" icon={<IconAlertTriangle size={16} />}>
                        {t('tripDetails.edit.alerts.editingMode.description')}
                    </Alert>
                )}

                <fieldset disabled={isReadOnly} style={{ border: 'none', padding: 0, margin: 0 }}>
                    <Stack gap="lg">
                        <Title order={4} td="underline">{t('tripDetails.edit.sections.tripDetails')}</Title>
                        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                            <Autocomplete
                                label={t('tripDetails.edit.labels.from')}
                                placeholder={t('tripDetails.edit.placeholders.from')}
                                leftSection={<IconMapPin size={16} />}
                                data={startSuggestions}
                                value={form.values.from_input_text}
                                onChange={handleStartChange}
                                onOptionSubmit={(val) => {
                                    form.setFieldValue('from_input_text', val);
                                    const pid = predictionsMap.current.get(val);
                                    if (pid) setStartPlaceId(pid);
                                    console.log(pid)
                                }}
                                rightSection={renderRightSection(loadingStart, form.values.from_input_text, clearStart)}
                            />
                            <Autocomplete
                                label={t('tripDetails.edit.labels.to')}
                                placeholder={t('tripDetails.edit.placeholders.to')}
                                leftSection={<IconMapPin size={16} />}
                                data={endSuggestions}
                                value={form.values.to_input_text}
                                onChange={handleEndChange}
                                onOptionSubmit={(val) => {
                                    form.setFieldValue('to_input_text', val);
                                    const pid = predictionsMap.current.get(val);
                                    if (pid) setEndPlaceId(pid);
                                }}
                                rightSection={renderRightSection(loadingEnd, form.values.to_input_text, clearEnd)}
                            />
                        </SimpleGrid>

                        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                            <Stack gap="xs">
                                <NumberInput
                                    label={t('tripDetails.edit.labels.pickupRadius')}
                                    description={t('tripDetails.edit.descriptions.pickupRadius')}
                                    min={0}
                                    step={100}
                                    {...form.getInputProps('pickupRadius')}
                                />
                                {trip.origin && (
                                    <RadiusMap
                                        lat={trip.origin.lat}
                                        lng={trip.origin.lng}
                                        radiusMeters={form.values.pickupRadius || 0}
                                        type="pickup"
                                    />
                                )}
                            </Stack>

                            <Stack gap="xs">
                                <NumberInput
                                    label={t('tripDetails.edit.labels.dropoffRadius')}
                                    description={t('tripDetails.edit.descriptions.dropoffRadius')}
                                    min={0}
                                    step={100}
                                    {...form.getInputProps('dropoffRadius')}
                                />
                                {trip.destination && (
                                    <RadiusMap
                                        lat={trip.destination.lat}
                                        lng={trip.destination.lng}
                                        radiusMeters={form.values.dropoffRadius || 0}
                                        type="dropoff"
                                    />
                                )}
                            </Stack>
                        </SimpleGrid>

                        <DateTimePicker
                            label={t('tripDetails.edit.labels.departureTime')}
                            placeholder={t('tripDetails.edit.placeholders.pickDate')}
                            leftSection={<IconCalendar size={16} />}
                            valueFormat="MM/DD/YYYY HH:mm"
                            minDate={new Date()}
                            {...form.getInputProps('departure_time')}
                        />

                        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                            <NumberInput
                                label={t('tripDetails.edit.labels.price')}
                                placeholder="0.00"
                                min={0}
                                decimalScale={2}
                                leftSection={<IconCurrencyDollar size={16} />}
                                {...form.getInputProps('price')}
                            />
                            <NumberInput
                                label={t('tripDetails.edit.labels.totalSeats')}
                                placeholder="1"
                                min={1}
                                {...form.getInputProps('total_seats')}
                            />
                        </SimpleGrid>

                        <Select
                            label={t('tripDetails.edit.labels.vehicle')}
                            placeholder={t('tripDetails.edit.placeholders.selectCar')}
                            data={[
                                { value: 'none', label: t('dashboard.common.noVehicle') },
                                ...cars.map(c => ({ value: c.id, label: `${c.year} ${c.make} ${c.model}` }))
                            ]}
                            leftSection={<IconCar size={16} />}
                            {...form.getInputProps('car')}
                        />
                        <Text size="xs" c="dimmed" mt={-10} mb="xs">
                            <Trans
                                i18nKey="tripDetails.edit.notes.addVehicle"
                                components={{ 1: <Anchor component={LocalizedLink} href="/cars" style={{ textDecoration: 'underline' }} /> }}
                            />
                        </Text>

                        <Textarea
                            label={t('tripDetails.edit.labels.tripNotes')}
                            placeholder={t('tripDetails.edit.placeholders.tripNotes')}
                            autosize
                            minRows={4}
                            leftSection={<IconScript size={16} />}
                            {...form.getInputProps('notes')}
                        />

                        <Divider />
                        <Title order={4} td="underline">{t('tripDetails.edit.sections.rulesLogistics')}</Title>

                        {/* Logistics Step */}
                        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                            <TagsInput
                                label={t('tripDetails.edit.labels.paymentMethods')}
                                data={['Cash', 'Venmo', 'Zelle', 'WeChat', 'CashApp']}
                                placeholder={t('tripDetails.edit.placeholders.paymentMethods')}
                                {...form.getInputProps('paymentMethods')}
                            />
                            <TextInput
                                label={t('tripDetails.edit.labels.paymentHandle')}
                                placeholder={t('tripDetails.edit.placeholders.paymentHandle')}
                                {...form.getInputProps('paymentHandle')}
                            />
                        </SimpleGrid>

                        <Textarea
                            label={t('tripDetails.edit.labels.pickupRules')}
                            placeholder={t('tripDetails.edit.placeholders.pickupRules')}
                            autosize
                            minRows={2}
                            {...form.getInputProps('pickupRules')}
                        />

                        <Textarea
                            label={t('tripDetails.edit.labels.cancellationPolicy')}
                            placeholder={t('tripDetails.edit.placeholders.cancellationPolicy')}
                            minRows={2}
                            autosize
                            {...form.getInputProps('cancellationPolicy')}
                        />

                        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                            <NumberInput
                                label={t('tripDetails.edit.labels.bigLuggageLimit')}
                                min={0}
                                {...form.getInputProps('bigLuggage')}
                            />
                            <NumberInput
                                label={t('tripDetails.edit.labels.smallLuggageLimit')}
                                min={0}
                                {...form.getInputProps('smallLuggage')}
                            />
                        </SimpleGrid>

                        <Divider label={t('tripDetails.edit.sections.settings')} labelPosition="center" />

                        {/* Settings Step */}
                        <NumberInput
                            label={t('tripDetails.edit.labels.departureFlexibility')}
                            description={t('tripDetails.edit.descriptions.departureFlexibility')}
                            min={0}
                            {...form.getInputProps('flexibility')}
                        />


                        <Accordion variant="separated" defaultValue="settings">
                            <Accordion.Item value="settings">
                                <Accordion.Control>{t('tripDetails.edit.sections.advancedRules')}</Accordion.Control>
                                <Accordion.Panel>
                                    <Stack gap="md">
                                        <Switch
                                            label={t('tripDetails.edit.labels.autoAccept')}
                                            description={t('tripDetails.edit.descriptions.autoAccept')}
                                            checked={form.values.autoAccept}
                                            onChange={(e) => {
                                                form.setFieldValue('autoAccept', e.currentTarget.checked);
                                            }}
                                        />

                                        <Stack gap="xs">
                                            <Switch
                                                label={t('tripDetails.edit.labels.autoStartCheckIn')}
                                                description={t('tripDetails.edit.descriptions.autoStartCheckIn')}
                                                checked={form.values.startCheckInEnabled}
                                                onChange={(e) => {
                                                    form.setFieldValue('startCheckInEnabled', e.currentTarget.checked);
                                                    form.setFieldValue('startCheckInHrs', e.currentTarget.checked ? 3 : ('' as any));
                                                }}
                                            />
                                            {form.values.startCheckInEnabled && (
                                                <NumberInput
                                                    label={t('tripDetails.edit.labels.startCheckInTime')}
                                                    placeholder="3"
                                                    min={0.1}
                                                    decimalScale={2}
                                                    {...form.getInputProps('startCheckInHrs')}
                                                />
                                            )}
                                        </Stack>

                                        <Stack gap="xs">
                                            <Switch
                                                label={t('tripDetails.edit.labels.bookingCutoff')}
                                                description={t('tripDetails.edit.descriptions.bookingCutoff')}
                                                checked={form.values.cutoffEnabled}
                                                onChange={(e) => {
                                                    form.setFieldValue('cutoffEnabled', e.currentTarget.checked);
                                                    form.setFieldValue('cutoffTime', e.currentTarget.checked ? 3 : null);
                                                }}
                                            />
                                            {form.values.cutoffEnabled && (
                                                <NumberInput
                                                    label={t('tripDetails.edit.labels.cutoffHours')}
                                                    description={t('tripDetails.edit.descriptions.cutoffHours')}
                                                    placeholder="1"
                                                    min={0.1}
                                                    step={0.5}
                                                    decimalScale={2}
                                                    {...form.getInputProps('cutoffTime')}
                                                    value={form.values.cutoffTime === null ? '' : form.values.cutoffTime}
                                                />
                                            )}
                                        </Stack>

                                        <Divider />

                                        <NumberInput
                                            label={t('tripDetails.edit.labels.payWindow')}
                                            description={t('tripDetails.edit.descriptions.payWindow')}
                                            {...form.getInputProps('payWindow')}
                                            min={5}
                                            step={5}
                                        />
                                    </Stack>
                                </Accordion.Panel>
                            </Accordion.Item>
                        </Accordion>

                        {!isReadOnly && (
                            <Button type="submit" loading={loading} fullWidth mt="md">
                                {t('tripDetails.edit.actions.saveChanges')}
                            </Button>
                        )}
                    </Stack>
                </fieldset>
            </Stack>
        </form>
    );
}
