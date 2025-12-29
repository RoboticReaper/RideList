import { useState, useEffect, useRef } from 'react';
import { Button, NumberInput, Stack, Textarea, Group, Switch, Select, Alert, MultiSelect, SimpleGrid, Title, Divider, Autocomplete, Loader, ActionIcon, TextInput, TagsInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { DateTimePicker } from '@mantine/dates';
import { useAuth } from '@/components/firebase/AuthContext';
import { IconCheck, IconAlertTriangle, IconCalendar, IconCar, IconMapPin, IconCurrencyDollar, IconScript, IconX } from '@tabler/icons-react';

interface EditTripViewProps {
    trip: any; // Using any for simplicity as Trip type is large
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

export function EditTripView({ trip }: EditTripViewProps) {
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

    // Parse flexibility interval to hours (number)
    const parseIntervalToHours = (interval: any) => {
        if (!interval) return 0.25;
        if (typeof interval === 'object') {
            return (interval.hours || 0) + (interval.minutes || 0) / 60;
        }
        return 0.25; // fallback
    };

    // Parse cutoff interval to hours (number)
    const parseCutoffToHours = (interval: any) => {
        if (!interval) return '';
        if (typeof interval === 'object') {
            const h = (interval.hours || 0) + (interval.minutes || 0) / 60;
            return h > 0 ? h : '';
        }
    };

    // Parse pay window interval to minutes (number)
    const parsePayWindowToMinutes = (interval: any) => {
        if (!interval) return 30; // default
        if (typeof interval === 'object') {
            const m = (interval.hours || 0) * 60 + (interval.minutes || 0);
            return m > 0 ? m : 30;
        }
        // If string "30 minutes"
        const p = parseInt(String(interval));
        return isNaN(p) ? 30 : p;
    };

    const form = useForm({
        initialValues: {
            // Trip Details
            from_text: trip.from_text || '',
            to_text: trip.to_text || '',
            departure_time: trip.departure_time ? new Date(trip.departure_time) : null,
            price: Number(trip.price),
            total_seats: Number(trip.seats.total),
            car: trip.car?.id || 'none', // 'none' means no car/walking

            // Trip Note
            notes: trip.notes || '',

            // Logistics / Rules
            paymentMethods: trip.rules.payment.methods || [],
            paymentHandle: trip.rules.payment.handle || '',
            cancellationPolicy: trip.rules.cancellation_policy || '',

            bigLuggage: Number(trip.rules.luggage.big ?? 0),
            smallLuggage: Number(trip.rules.luggage.small ?? 0),

            pickupRules: trip.rules.pickup.rules || '',
            pickupRadius: Number(trip.rules.pickup.radius ?? 1000),
            dropoffRadius: Number(trip.rules.pickup.dropoff_radius ?? 1000),

            flexibility: parseIntervalToHours(trip.rules.time_flexibility),
            autoAccept: trip.rules.auto_accept,
            cutoffTime: parseCutoffToHours(trip.rules.cutoff_time), // number of hours
            payWindow: parsePayWindowToMinutes(trip.rules.pay_window),
        },
    });

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
        form.setFieldValue('from_text', val);

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
        form.setFieldValue('to_text', val);

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
        form.setFieldValue('from_text', '');
        setStartPlaceId(null);
        setStartSuggestions([]);
        startSessionToken.current = crypto.randomUUID();
    };

    const clearEnd = () => {
        form.setFieldValue('to_text', '');
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
        if (!values.from_text?.trim()) {
            notifications.show({ title: 'Missing Start Location', message: 'Please select a start location.', color: 'red' });
            return;
        }
        if (!values.to_text?.trim()) {
            notifications.show({ title: 'Missing Destination', message: 'Please select a destination.', color: 'red' });
            return;
        }

        // VALIDATION: Ensure From/To are valid Place IDs if changed
        if (form.isDirty('from_text')) {
            if (!startPlaceId) {
                notifications.show({ title: 'Invalid Start Location', message: 'Please select a valid start location from the suggestions.', color: 'red' });
                return;
            }
        }
        if (form.isDirty('to_text')) {
            if (!endPlaceId) {
                notifications.show({ title: 'Invalid Destination', message: 'Please select a valid destination from the suggestions.', color: 'red' });
                return;
            }
        }

        // VALIDATION: Database NOT NULL checks
        if (!values.departure_time) {
            notifications.show({ title: 'Missing Departure Time', message: 'Please select a departure time.', color: 'red' });
            return;
        }

        // total_seats > 0
        if (!values.total_seats || values.total_seats < 1) {
            notifications.show({ title: 'Invalid Seats', message: 'Total seats must be at least 1.', color: 'red' });
            return;
        }

        // Validate Price (Must be number >= 0, not empty)
        // Check for undefined, null, or empty string (though initialValues casts to Number, clearing input might make it '')
        if ((values.price as any) === '' || values.price === undefined || values.price === null || Number(values.price) < 0) {
            notifications.show({ title: 'Invalid Price', message: 'Please enter a valid price (0 or greater).', color: 'red' });
            return;
        }


        // pickup/dropoff radius > 0 (DB check: > 0)
        // Although DB default is 1000, form might send 0 or empty?
        // NumberInput with empty value sends '' or 0? 
        // We cast to Number() in initialValues, but onChange handles it. 
        if (!values.pickupRadius || values.pickupRadius <= 0) {
            notifications.show({ title: 'Invalid Pickup Radius', message: 'Pickup radius must be greater than 0 meters.', color: 'red' });
            return;
        }
        if (!values.dropoffRadius || values.dropoffRadius <= 0) {
            notifications.show({ title: 'Invalid Dropoff Radius', message: 'Dropoff radius must be greater than 0 meters.', color: 'red' });
            return;
        }

        // flexibility (interval not null) - Logic allows 0?
        // DB says: departure_time_flexibility interval not null default interval '15 minutes'
        // Intervals can be 0.
        // But let's ensure it's not empty text if that's possible.
        // It's a number input. 0 is valid "no flexibility".
        if (values.flexibility === '' || values.flexibility === undefined || values.flexibility === null) {
            notifications.show({ title: 'Invalid Flexibility', message: 'Please specify flexibility (0 for none).', color: 'red' });
            return;
        }

        // Validate Capacity against Car
        if (values.car !== 'none') {
            const selectedCar = cars.find(c => c.id === values.car);
            if (selectedCar) {
                // Check Seats
                if ((selectedCar.seats || 0) > 0 && Number(values.total_seats) > (selectedCar.seats || 0)) {
                    notifications.show({
                        title: 'Capacity Exceeded',
                        message: `Total seats (${values.total_seats}) cannot exceed car capacity (${selectedCar.seats}).`,
                        color: 'red'
                    });
                    return;
                }

                // Check Luggage (if car has limits)
                if (selectedCar.big_luggage !== undefined && selectedCar.big_luggage !== null) {
                    if (Number(values.bigLuggage || 0) > selectedCar.big_luggage) {
                        notifications.show({
                            title: 'Luggage Limit',
                            message: `Big luggage limit (${values.bigLuggage}) exceeds car capacity (${selectedCar.big_luggage}).`,
                            color: 'red'
                        });
                        return;
                    }
                }
                if (selectedCar.small_luggage !== undefined && selectedCar.small_luggage !== null) {
                    if (Number(values.smallLuggage || 0) > selectedCar.small_luggage) {
                        notifications.show({
                            title: 'Luggage Limit',
                            message: `Small luggage limit (${values.smallLuggage}) exceeds car capacity (${selectedCar.small_luggage}).`,
                            color: 'red'
                        });
                        return;
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

            if (values.cutoffTime !== '' && values.cutoffTime !== null) {
                payload.cutoffTime = `${values.cutoffTime} hours`;
            } else {
                payload.cutoffTime = null;
            }

            if (values.payWindow !== '' && values.payWindow !== null) {
                payload.payWindow = `${values.payWindow} minutes`;
            } else {
                payload.payWindow = '30 minutes';
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
                throw new Error(err.error || 'Update failed');
            }

            notifications.show({
                title: 'Success',
                message: 'Trip updated successfully',
                color: 'green',
                icon: <IconCheck size={16} />
            });
        } catch (error: any) {
            notifications.show({
                title: 'Error',
                message: error.message,
                color: 'red',
                icon: <IconAlertTriangle size={16} />
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={form.onSubmit(handleSubmit)}>
            <Stack gap="lg" maw={800} mx="auto">
                <Alert title="Editing Mode" color="blue" icon={<IconAlertTriangle size={16} />}>
                    Modifying and saving changes will update the listing immediately.
                </Alert>

                <Title order={4} td="underline">Trip Details</Title>
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                    <Autocomplete
                        label="From"
                        placeholder="Starting Location"
                        leftSection={<IconMapPin size={16} />}
                        data={startSuggestions}
                        value={form.values.from_text}
                        onChange={handleStartChange}
                        onOptionSubmit={(val) => {
                            form.setFieldValue('from_text', val);
                            const pid = predictionsMap.current.get(val);
                            if (pid) setStartPlaceId(pid);
                        }}
                        rightSection={renderRightSection(loadingStart, form.values.from_text, clearStart)}
                    />
                    <Autocomplete
                        label="To"
                        placeholder="Destination"
                        leftSection={<IconMapPin size={16} />}
                        data={endSuggestions}
                        value={form.values.to_text}
                        onChange={handleEndChange}
                        onOptionSubmit={(val) => {
                            form.setFieldValue('to_text', val);
                            const pid = predictionsMap.current.get(val);
                            if (pid) setEndPlaceId(pid);
                        }}
                        rightSection={renderRightSection(loadingEnd, form.values.to_text, clearEnd)}
                    />
                </SimpleGrid>
                <DateTimePicker
                    label="Departure Time"
                    placeholder="Pick date & time"
                    leftSection={<IconCalendar size={16} />}
                    {...form.getInputProps('departure_time')}
                />

                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                    <NumberInput
                        label="Price ($)"
                        placeholder="0.00"
                        min={0}
                        decimalScale={2}
                        leftSection={<IconCurrencyDollar size={16} />}
                        {...form.getInputProps('price')}
                    />
                    <NumberInput
                        label="Total Seats"
                        placeholder="1"
                        min={1}
                        {...form.getInputProps('total_seats')}
                    />
                </SimpleGrid>

                <Select
                    label="Vehicle"
                    placeholder="Select a car"
                    data={[
                        { value: 'none', label: 'No Vehicle / Walking' },
                        ...cars.map(c => ({ value: c.id, label: `${c.year} ${c.make} ${c.model}` }))
                    ]}
                    leftSection={<IconCar size={16} />}
                    {...form.getInputProps('car')}
                />

                <Textarea
                    label="Trip Notes"
                    placeholder="Additional details..."
                    autosize
                    leftSection={<IconScript size={16} />}
                    {...form.getInputProps('notes')}
                />

                <Divider />
                <Title order={4} td="underline">Rules & Logistics</Title>

                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                    <NumberInput
                        label="Big Luggage Limit"
                        min={0}
                        {...form.getInputProps('bigLuggage')}
                    />
                    <NumberInput
                        label="Small Luggage Limit"
                        min={0}
                        {...form.getInputProps('smallLuggage')}
                    />
                </SimpleGrid>

                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                    <NumberInput
                        label="Pickup Radius (m)"
                        min={0}
                        step={100}
                        {...form.getInputProps('pickupRadius')}
                    />
                    <NumberInput
                        label="Dropoff Radius (m)"
                        min={0}
                        step={100}
                        {...form.getInputProps('dropoffRadius')}
                    />
                </SimpleGrid>

                <Textarea
                    label="Pickup Rules"
                    placeholder="e.g. Wait at main entrance"
                    autosize
                    minRows={2}
                    {...form.getInputProps('pickupRules')}
                />

                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                    <TagsInput
                        label="Payment Methods"
                        data={['Cash', 'Venmo', 'Zelle', 'WeChat', 'CashApp']}
                        placeholder="Select methods"
                        {...form.getInputProps('paymentMethods')}
                    />
                    <TextInput
                        label="Payment Handle"
                        placeholder="e.g. @user"
                        {...form.getInputProps('paymentHandle')}
                    />
                </SimpleGrid>

                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                    <Textarea
                        label="Cancellation Policy"
                        placeholder="e.g. Free cancellation up to 24h before departure"
                        minRows={2}
                        autosize
                        {...form.getInputProps('cancellationPolicy')}
                    />
                    <NumberInput
                        label="Booking Cutoff (Hours before)"
                        placeholder="e.g. 1"
                        min={0}
                        step={0.5}
                        decimalScale={2}
                        {...form.getInputProps('cutoffTime')}
                    />
                </SimpleGrid>

                <NumberInput
                    label="Wait Flexibility (Hours)"
                    description="How long are you willing to wait?"
                    min={0}
                    step={0.25}
                    {...form.getInputProps('flexibility')}
                />

                <Switch
                    label="Auto-accept Bookings"
                    {...form.getInputProps('autoAccept', { type: 'checkbox' })}
                />

                <NumberInput
                    label="Pay Window (Minutes)"
                    description="Time for rider to pay after approval"
                    min={5}
                    step={5}
                    {...form.getInputProps('payWindow')}
                />

                <Button type="submit" loading={loading} fullWidth mt="md">
                    Save Changes
                </Button>
            </Stack>
        </form>
    );
}
