'use client';

import { useState, useRef, useEffect } from 'react';
import {
    Paper,
    Button,
    Box,
    Autocomplete,
    Loader as MantineLoader,
    Stack,
    ActionIcon,
    Stepper,
    NumberInput,
    MultiSelect,
    TextInput,
    Group,
    Switch,
    Select,
    Accordion,
    Textarea,
    Title,
    Text,
    Card,
    Radio,
    Badge,
    Checkbox,
    Modal
} from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import { IconMapPin, IconCalendar, IconX, IconCar } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useAuth } from '../firebase/AuthContext';

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

export function TripInputBar() {
    const { user, handleProtectedAction } = useAuth();
    // Stepper State
    const [active, setActive] = useState(0);

    // Auth Modal State
    const [authModalOpen, setAuthModalOpen] = useState(false);

    // --- Step 1: Route & Date State ---
    const [startLocation, setStartLocation] = useState('');
    const [endLocation, setEndLocation] = useState('');
    const [startTime, setStartTime] = useState<Date | null>(null);

    const [isStartSelected, setIsStartSelected] = useState(false);
    const [isEndSelected, setIsEndSelected] = useState(false);
    const startLastSelection = useRef<string>('');
    const endLastSelection = useRef<string>('');

    // Session Tokens
    const startSessionToken = useRef<string>(typeof crypto !== 'undefined' ? crypto.randomUUID() : '');
    const endSessionToken = useRef<string>(typeof crypto !== 'undefined' ? crypto.randomUUID() : '');

    const predictionsMap = useRef<Map<string, string>>(new Map());
    const [startPlaceId, setStartPlaceId] = useState<string | null>(null);
    const [endPlaceId, setEndPlaceId] = useState<string | null>(null);

    const [startSuggestions, setStartSuggestions] = useState<string[]>([]);
    const [endSuggestions, setEndSuggestions] = useState<string[]>([]);
    const [loadingStart, setLoadingStart] = useState(false);
    const [loadingEnd, setLoadingEnd] = useState(false);

    // --- Step 2: Core Details State ---
    const [price, setPrice] = useState<number | ''>('');
    const [seats, setSeats] = useState<number | ''>(1);

    // --- Step 3: Vehicle Info State (Modified) ---
    const [savedCars, setSavedCars] = useState<Car[]>([]);
    const [selectedCarId, setSelectedCarId] = useState<string>('new'); // 'new' or UUID
    const [loadingCars, setLoadingCars] = useState(false);

    const [carMake, setCarMake] = useState('');
    const [carModel, setCarModel] = useState('');
    const [carColor, setCarColor] = useState('');
    const [carYear, setCarYear] = useState('');
    const [carPlate, setCarPlate] = useState('');
    const [carBigLuggage, setCarBigLuggage] = useState<number | ''>('');
    const [carSmallLuggage, setCarSmallLuggage] = useState<number | ''>('');
    const [carSeats, setCarSeats] = useState<number | ''>('');

    const hasFetchedCars = useRef(false);


    // Fetch cars when entering step 3 (active = 2) or on mount if user exists
    useEffect(() => {
        if (user && active === 2 && !hasFetchedCars.current) {
            setLoadingCars(true);
            user.getIdToken().then(token => {
                fetch('/api/user/cars', {
                    headers: { 'Authorization': `Bearer ${token}` }
                })
                    .then(res => res.json())
                    .then(data => {
                        hasFetchedCars.current = true;
                        if (data.cars) {
                            setSavedCars(data.cars);
                            // Only default to first car if user defines 'new' (default) 
                            // and hasn't explicitly chosen 'none' or another car (e.g. from draft restoration)
                            if (data.cars.length > 0 && selectedCarId === 'new') {
                                setSelectedCarId(data.cars[0].id);
                            }
                        }
                    })
                    .catch(err => console.error("Failed to fetch cars", err))
                    .finally(() => setLoadingCars(false));
            });
        }
    }, [user, active, selectedCarId]);


    // --- Step 4: Logistics State ---
    const [paymentMethods, setPaymentMethods] = useState<string[]>([]);
    const [paymentHandle, setPaymentHandle] = useState('');
    const [bigLuggage, setBigLuggage] = useState<number | ''>(0);
    const [smallLuggage, setSmallLuggage] = useState<number | ''>(0);

    // --- Step 5: Rules State ---
    const [autoAccept, setAutoAccept] = useState(true);
    const [flexibility, setFlexibility] = useState('15 minutes');
    const [pickupRadius, setPickupRadius] = useState<number | ''>(1000);
    const [dropoffRadius, setDropoffRadius] = useState<number | ''>(1000);
    const [pickupRules, setPickupRules] = useState('');
    const [cancellationPolicy, setCancellationPolicy] = useState('');
    const [cutoffEnabled, setCutoffEnabled] = useState(false);
    const [cutoffHours, setCutoffHours] = useState<number | ''>('');
    const [notes, setNotes] = useState('');

    // --- Helper Functions for Step 1 ---
    // define TripDraft interface
    interface TripDraft {
        active: number;
        startLocation: string;
        endLocation: string;
        startTime: string | null; // Date stored as string
        price: number | '';
        seats: number | '';
        selectedCarId: string;
        carMake: string;
        carModel: string;
        carColor: string;
        carYear: string;
        carPlate: string;
        carBigLuggage: number | '';
        carSmallLuggage: number | '';
        carSeats: number | '';
        paymentMethods: string[];
        paymentHandle: string;
        bigLuggage: number | '';
        smallLuggage: number | '';
        autoAccept: boolean;
        flexibility: string;
        pickupRadius: number | '';
        dropoffRadius: number | '';
        pickupRules: string;
        cancellationPolicy: string;
        cutoffEnabled: boolean;
        cutoffHours: number | '';
        notes: string;
        startPlaceId: string | null;
        endPlaceId: string | null;
    }

    // Load Draft on Mount
    useEffect(() => {
        try {
            const draftJson = localStorage.getItem('trip_draft');
            if (draftJson) {
                const draft: TripDraft = JSON.parse(draftJson);
                // Restore State
                if (draft.active !== undefined) setActive(draft.active);
                if (draft.startLocation) {
                    setStartLocation(draft.startLocation);
                    setIsStartSelected(true); // Assume valid if from draft
                    startLastSelection.current = draft.startLocation;
                }
                if (draft.endLocation) {
                    setEndLocation(draft.endLocation);
                    setIsEndSelected(true);
                    endLastSelection.current = draft.endLocation;
                }
                if (draft.startTime) setStartTime(new Date(draft.startTime));
                if (draft.price !== undefined) setPrice(draft.price);
                if (draft.seats !== undefined) setSeats(draft.seats);

                if (draft.selectedCarId) setSelectedCarId(draft.selectedCarId);
                if (draft.carMake) setCarMake(draft.carMake);
                if (draft.carModel) setCarModel(draft.carModel);
                if (draft.carColor) setCarColor(draft.carColor);
                if (draft.carYear) setCarYear(draft.carYear);
                if (draft.carPlate) setCarPlate(draft.carPlate);
                if (draft.carBigLuggage !== undefined) setCarBigLuggage(draft.carBigLuggage);
                if (draft.carSmallLuggage !== undefined) setCarSmallLuggage(draft.carSmallLuggage);
                if (draft.carSeats !== undefined) setCarSeats(draft.carSeats);

                if (draft.paymentMethods) setPaymentMethods(draft.paymentMethods);
                if (draft.paymentHandle) setPaymentHandle(draft.paymentHandle);
                if (draft.bigLuggage !== undefined) setBigLuggage(draft.bigLuggage);
                if (draft.smallLuggage !== undefined) setSmallLuggage(draft.smallLuggage);

                if (draft.autoAccept !== undefined) setAutoAccept(draft.autoAccept);
                if (draft.flexibility) setFlexibility(draft.flexibility);
                if (draft.pickupRadius !== undefined) setPickupRadius(draft.pickupRadius);
                if (draft.dropoffRadius !== undefined) setDropoffRadius(draft.dropoffRadius);
                if (draft.pickupRules) setPickupRules(draft.pickupRules);
                if (draft.cancellationPolicy) setCancellationPolicy(draft.cancellationPolicy);
                if (draft.cutoffEnabled !== undefined) setCutoffEnabled(draft.cutoffEnabled);
                if (draft.cutoffHours !== undefined) setCutoffHours(draft.cutoffHours);
                if (draft.notes) setNotes(draft.notes);

                if (draft.startPlaceId) setStartPlaceId(draft.startPlaceId);
                if (draft.endPlaceId) setEndPlaceId(draft.endPlaceId);

                // Check if draft has meaningful data (non-default)
                const isMeaningful =
                    (draft.active > 0) ||
                    (!!draft.startLocation) ||
                    (!!draft.endLocation) ||
                    (!!draft.startTime) ||
                    (draft.price !== '' && draft.price !== undefined) ||
                    (draft.seats !== 1 && draft.seats !== '' && draft.seats !== undefined) ||
                    (draft.selectedCarId !== 'new' && draft.selectedCarId !== undefined) ||
                    // If car is new, check if any car details are filled
                    (draft.selectedCarId === 'new' && (
                        !!draft.carMake || !!draft.carModel || !!draft.carColor ||
                        !!draft.carYear || !!draft.carPlate ||
                        (draft.carBigLuggage !== '' && draft.carBigLuggage !== undefined) ||
                        (draft.carSmallLuggage !== '' && draft.carSmallLuggage !== undefined) ||
                        (draft.carSeats !== '' && draft.carSeats !== undefined)
                    )) ||
                    (draft.paymentMethods && draft.paymentMethods.length > 0) ||
                    (!!draft.paymentHandle) ||
                    (draft.bigLuggage !== 0 && draft.bigLuggage !== '' && draft.bigLuggage !== undefined) ||
                    (draft.smallLuggage !== 0 && draft.smallLuggage !== '' && draft.smallLuggage !== undefined) ||
                    (draft.autoAccept === false) || // Default is true
                    (draft.flexibility !== '15 minutes' && !!draft.flexibility) ||
                    (draft.pickupRadius !== 1000 && draft.pickupRadius !== '' && draft.pickupRadius !== undefined) ||
                    (draft.dropoffRadius !== 1000 && draft.dropoffRadius !== '' && draft.dropoffRadius !== undefined) ||
                    (!!draft.pickupRules) ||
                    (!!draft.cancellationPolicy) ||
                    (draft.cutoffEnabled === true) ||
                    (!!draft.notes);

                if (isMeaningful) {
                    notifications.show({
                        id: 'draft-restored',
                        title: 'Restored Draft',
                        message: 'We restored your previous trip details.',
                        color: 'blue',
                        autoClose: 3000
                    });
                }
            }
        } catch (e) {
            console.error("Failed to load draft", e);
        }
    }, []);

    // Save Draft Effect (Debounced)
    useEffect(() => {
        const timeout = setTimeout(() => {
            let encodedStartTime = null;
            if (startTime) {
                if (startTime instanceof Date) {
                    encodedStartTime = startTime.toISOString();
                } else if (typeof startTime === 'string') {
                    encodedStartTime = startTime;
                }
            }

            const draft: TripDraft = {
                active,
                startLocation,
                endLocation,
                startTime: encodedStartTime,
                price,
                seats,
                selectedCarId,
                carMake,
                carModel,
                carColor,
                carYear,
                carPlate,
                carBigLuggage,
                carSmallLuggage,
                carSeats,
                paymentMethods,
                paymentHandle,
                bigLuggage,
                smallLuggage,
                autoAccept,
                flexibility,
                pickupRadius,
                dropoffRadius,
                pickupRules,
                cancellationPolicy,
                cutoffEnabled,
                cutoffHours,
                notes,
                startPlaceId,
                endPlaceId
            };
            localStorage.setItem('trip_draft', JSON.stringify(draft));
        }, 1000); // Save after 1 second of inactivity

        return () => clearTimeout(timeout);
    }, [
        active, startLocation, endLocation, startTime, price, seats,
        selectedCarId, carMake, carModel, carColor, carYear, carPlate,
        carBigLuggage, carSmallLuggage, carSeats, paymentMethods, paymentHandle,
        bigLuggage, smallLuggage, autoAccept, flexibility, pickupRadius,
        dropoffRadius, pickupRules, cancellationPolicy, cutoffEnabled,
        cutoffHours, notes, startPlaceId, endPlaceId
    ]);

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

    const debounceTimeout = useRef<NodeJS.Timeout | null>(null);
    const debounceFetch = (query: string, setSuggestions: (data: string[]) => void, setLoading: (l: boolean) => void, sessionToken: string) => {
        if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
        debounceTimeout.current = setTimeout(() => {
            fetchPlaces(query, setSuggestions, setLoading, sessionToken);
        }, 300);
    };

    const handleStartChange = (val: string) => {
        setStartLocation(val);
        if (val !== startLastSelection.current) {
            setIsStartSelected(false);
            startLastSelection.current = '';
            setStartPlaceId(null);
        }
        if (!startSessionToken.current) startSessionToken.current = crypto.randomUUID();
        debounceFetch(val, setStartSuggestions, setLoadingStart, startSessionToken.current);
    };

    const handleEndChange = (val: string) => {
        setEndLocation(val);
        if (val !== endLastSelection.current) {
            setIsEndSelected(false);
            endLastSelection.current = '';
            setEndPlaceId(null);
        }
        if (!endSessionToken.current) endSessionToken.current = crypto.randomUUID();
        debounceFetch(val, setEndSuggestions, setLoadingEnd, endSessionToken.current);
    };

    const clearStart = () => {
        setStartLocation('');
        setIsStartSelected(false);
        startLastSelection.current = '';
        setStartPlaceId(null);
        setStartSuggestions([]);
    };

    const clearEnd = () => {
        setEndLocation('');
        setIsEndSelected(false);
        endLastSelection.current = '';
        setEndPlaceId(null);
        setEndSuggestions([]);
    };

    const renderRightSection = (loading: boolean, value: string, onClear: () => void) => {
        if (loading) return <MantineLoader size="xs" />;
        if (value) {
            return (
                <ActionIcon variant="transparent" color="gray" onClick={onClear}>
                    <IconX size={16} />
                </ActionIcon>
            );
        }
        return null;
    };

    // --- Navigation Logic ---
    const nextStep = () => {
        // Step 1 Validation
        if (active === 0) {
            if (!isStartSelected || !startPlaceId) {
                notifications.show({ title: 'Invalid Start', message: 'Please select a valid start location from the dropdown menu.', color: 'red' });
                return;
            }
            if (!isEndSelected || !endPlaceId) {
                notifications.show({ title: 'Invalid Destination', message: 'Please select a valid destination from the dropdown menu.', color: 'red' });
                return;
            }
            if (!startTime) {
                notifications.show({ title: 'Date Required', message: 'Please select a departure time.', color: 'red' });
                return;
            }
        }

        // Step 2 Validation (Details)
        if (active === 1) {
            if (price === '' || price < 0) {
                notifications.show({ title: 'Price Required', message: 'Please enter a valid price.', color: 'red' });
                return;
            }
            if (seats === '' || seats < 1) {
                notifications.show({ title: 'Seats Required', message: 'Please enter at least 1 seat.', color: 'red' });
                return;
            }
        }

        // Step 3 Validation (Vehicle)
        if (active === 2) {
            if (selectedCarId === 'new') {
                const isAnyFieldFilled = carMake.trim() || carModel.trim() || carColor.trim() || carYear.trim() || carPlate.trim() || carBigLuggage !== '' || carSmallLuggage !== '' || carSeats !== '';

                if (isAnyFieldFilled) {
                    if (carSeats === '' || carSeats < 1) {
                        notifications.show({ title: 'Car Seats Required', message: 'If you are adding a vehicle, please specify the number of seats.', color: 'red' });
                        return;
                    }
                }
            }
        }

        // Step 4 Validation (Logistics)
        if (active === 3) {
            // Payment Methods are now OPTIONAL
            /* if (paymentMethods.length === 0) {
                notifications.show({ title: 'Payment Method Required', message: 'Please select at least one method.', color: 'red' });
                return;
            } */
            // Payment Handle is now OPTIONAL

            if (cutoffEnabled) {
                if (cutoffHours === '' || cutoffHours <= 0) {
                    notifications.show({ title: 'Invalid Cutoff Time', message: 'Please enter a valid number of hours (must be > 0).', color: 'red' });
                    return;
                }
            }
        }

        setActive((current) => (current < 4 ? current + 1 : active));
    };

    const prevStep = () => setActive((current) => (current > 0 ? current - 1 : current));

    const handleFinalSubmit = async () => {
        // 1. Handle Unauthenticated User
        if (!user) {
            // Draft is already saved by the useEffect, but we can ensure it's up to date if we wanted.
            // Since useEffect handles it, we just open the modal.
            setAuthModalOpen(true);
            return;
        }

        const payload: any = {
            start: { text: startLocation, placeId: startPlaceId, sessionToken: startSessionToken.current },
            end: { text: endLocation, placeId: endPlaceId, sessionToken: endSessionToken.current },
            departureTime: startTime,
            price: Number(price),
            seats: Number(seats),
            paymentMethods,
            paymentHandle,
            bigLuggage: Number(bigLuggage),
            smallLuggage: Number(smallLuggage),
            autoAccept,
            flexibility,
            pickupRadius: Number(pickupRadius),
            dropoffRadius: Number(dropoffRadius),
            pickupRules,
            cancellationPolicy,
            cutoffTime: (cutoffEnabled && cutoffHours !== '') ? `${cutoffHours} hours` : null,
            notes
        };

        // Attach Car Info
        if (selectedCarId === 'new') {
            const isAnyFieldFilled = carMake.trim() || carModel.trim() || carColor.trim() || carYear.trim() || carPlate.trim() || carBigLuggage !== '' || carSmallLuggage !== '' || carSeats !== '';

            if (isAnyFieldFilled) {
                payload.car = {
                    make: carMake,
                    model: carModel,
                    color: carColor,
                    year: carYear,
                    plate: carPlate,
                    big_luggage: carBigLuggage !== '' ? carBigLuggage : null,
                    small_luggage: carSmallLuggage !== '' ? carSmallLuggage : null,
                    seats: carSeats !== '' ? Number(carSeats) : null,
                };
            } else {
                // Treat as "No Vehicle" if all fields are empty
                payload.carId = null;
            }
        } else if (selectedCarId === 'none') {
            payload.carId = null;
        } else {
            payload.carId = selectedCarId;
        }

        const id = notifications.show({
            loading: true,
            title: 'Posting Trip',
            message: 'Please wait...',
            autoClose: false,
            withCloseButton: false,
        });

        try {
            const token = await user.getIdToken();
            const res = await fetch('/api/trips/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload),
            });
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Failed to create trip');

            // CLEAR DRAFT ON SUCCESS
            localStorage.removeItem('trip_draft');

            notifications.update({
                id,
                color: 'green',
                title: 'Success!',
                message: 'Your trip has been posted.',
                icon: <IconMapPin size={18} />,
                loading: false,
                autoClose: 2000,
            });

            setTimeout(() => window.location.reload(), 1500);

        } catch (error: any) {
            notifications.update({
                id,
                color: 'red',
                title: 'Error',
                message: error.message,
                loading: false,
                autoClose: 3000,
            });
        }
    };

    return (
        <Paper p="md" radius="md" shadow="sm" withBorder w="100%">
            <Stepper active={active} onStepClick={setActive} allowNextStepsSelect={false}>

                {/* STEP 1: Route & Date */}
                <Stepper.Step label="Route" description="Where & When">
                    <Stack gap="md" mt="lg">
                        <Title order={4}>Trip Route</Title>
                        <Autocomplete
                            label="From"
                            placeholder="Starting Location"
                            leftSection={<IconMapPin size={16} />}
                            data={startSuggestions}
                            value={startLocation}
                            onChange={handleStartChange}
                            onOptionSubmit={(val) => {
                                setStartLocation(val);
                                setIsStartSelected(true);
                                startLastSelection.current = val;
                                const pid = predictionsMap.current.get(val);
                                if (pid) setStartPlaceId(pid);
                            }}
                            rightSection={renderRightSection(loadingStart, startLocation, clearStart)}
                        />

                        <Autocomplete
                            label="To"
                            placeholder="Destination"
                            leftSection={<IconMapPin size={16} />}
                            data={endSuggestions}
                            value={endLocation}
                            onChange={handleEndChange}
                            onOptionSubmit={(val) => {
                                setEndLocation(val);
                                setIsEndSelected(true);
                                endLastSelection.current = val;
                                const pid = predictionsMap.current.get(val);
                                if (pid) setEndPlaceId(pid);
                            }}
                            rightSection={renderRightSection(loadingEnd, endLocation, clearEnd)}
                        />

                        <DateTimePicker
                            label="Departure"
                            placeholder="Pick date & time"
                            leftSection={<IconCalendar size={16} />}
                            value={startTime}
                            onChange={(val) => setStartTime(val as Date | null)}
                        />

                        <Group justify="flex-end" mt="md">
                            <Button onClick={nextStep}>Next: Trip Details</Button>
                        </Group>
                    </Stack>
                </Stepper.Step>

                {/* STEP 2: Core Details */}
                <Stepper.Step label="Details" description="Price & Capacity">
                    <Stack gap="md" mt="lg">
                        <Title order={4}>Trip Details</Title>
                        <NumberInput
                            label="Price per Person ($)"
                            placeholder="25.00"
                            prefix="$ "
                            decimalScale={2}
                            fixedDecimalScale
                            value={price}
                            onChange={(val) => setPrice(val === '' ? '' : Number(val))}
                            min={0}
                            required
                        />
                        <NumberInput
                            label="Total Seats Available"
                            description="How many passengers can you take?"
                            value={seats}
                            onChange={(val) => setSeats(val === '' ? '' : Number(val))}
                            min={1}
                            max={20}
                            required
                        />
                        <Group justify="space-between" mt="md">
                            <Button variant="default" onClick={prevStep}>Back</Button>
                            <Button onClick={nextStep}>Next: Vehicle</Button>
                        </Group>
                    </Stack>
                </Stepper.Step>

                {/* STEP 3: Vehicle Info (Dynamic Selection) */}
                <Stepper.Step label="Vehicle" description="Your Car">
                    <Stack gap="md" mt="lg">
                        <Title order={4}>Vehicle Details</Title>

                        {/* Saved Cars Selection */}
                        {loadingCars ? <MantineLoader size="sm" /> : (
                            <Radio.Group
                                value={selectedCarId}
                                onChange={setSelectedCarId}
                                label="Select a Saved Vehicle"
                                description="Or choose to add a new one"
                            >
                                <Stack mt="xs">
                                    <Paper withBorder p="sm" radius="md">
                                        <Radio
                                            value="none"
                                            label={<Text fw={500}>No Vehicle / Walking</Text>}
                                        />
                                    </Paper>

                                    {savedCars.map(car => (
                                        <Paper key={car.id} withBorder p="sm" radius="md">
                                            <Radio
                                                value={car.id}
                                                label={
                                                    <Group>
                                                        <Text fw={500}>{car.year} {car.make} {car.model}</Text>
                                                        <Badge color={car.color?.toLowerCase() || 'gray'} variant="light">{car.color}</Badge>
                                                        {car.plate && <Text size="xs" c="dimmed">{car.plate}</Text>}
                                                    </Group>
                                                }
                                            />
                                        </Paper>
                                    ))}
                                    <Paper withBorder p="sm" radius="md">
                                        <Radio
                                            value="new"
                                            label={<Text fw={500}>Add a New Vehicle</Text>}
                                        />
                                    </Paper>
                                </Stack>
                            </Radio.Group>
                        )}

                        {/* New Car Inputs (Only if "new" selected) */}
                        {selectedCarId === 'new' && (
                            <Box mt="md">
                                <Title order={6} mb="sm">Vehicle Info (Optional)</Title>
                                <Stack gap="sm">
                                    <Group grow>
                                        <TextInput
                                            label="Make"
                                            placeholder="Optional (e.g. Toyota)"
                                            value={carMake}
                                            onChange={(e) => setCarMake(e.currentTarget.value)}
                                        />
                                        <TextInput
                                            label="Model"
                                            placeholder="Optional (e.g. Camry)"
                                            value={carModel}
                                            onChange={(e) => setCarModel(e.currentTarget.value)}
                                        />
                                    </Group>
                                    <Group grow>
                                        <TextInput
                                            label="Color"
                                            placeholder="Optional (e.g. White)"
                                            value={carColor}
                                            onChange={(e) => setCarColor(e.currentTarget.value)}
                                        />
                                        <TextInput
                                            label="Year"
                                            placeholder="Optional (e.g. 2022)"
                                            value={carYear}
                                            onChange={(e) => setCarYear(e.currentTarget.value)}
                                        />
                                    </Group>
                                    <TextInput
                                        label="License Plate"
                                        placeholder="Optional"
                                        value={carPlate}
                                        onChange={(e) => setCarPlate(e.currentTarget.value)}
                                    />
                                    <Group grow>
                                        <NumberInput
                                            label="Big Luggage Cap."
                                            placeholder="Optional"
                                            value={carBigLuggage}
                                            onChange={(val) => setCarBigLuggage(val === '' ? '' : Number(val))}
                                            min={0}
                                        />
                                        <NumberInput
                                            label="Small Luggage Cap."
                                            placeholder="Optional"
                                            value={carSmallLuggage}
                                            onChange={(val) => setCarSmallLuggage(val === '' ? '' : Number(val))}
                                            min={0}
                                        />
                                    </Group>
                                    <NumberInput
                                        label="Number of Seats (Car Capacity)"
                                        description="Total seats in the car (inc. driver)"
                                        placeholder="Required (e.g. 5)"
                                        value={carSeats}
                                        onChange={(val) => setCarSeats(val === '' ? '' : Number(val))}
                                        min={1}
                                        required
                                    />
                                </Stack>
                            </Box>
                        )}

                        <Group justify="space-between" mt="md">
                            <Button variant="default" onClick={prevStep}>Back</Button>
                            <Button onClick={nextStep}>Next: Logistics</Button>
                        </Group>
                    </Stack>
                </Stepper.Step>

                {/* STEP 4: Logistics */}
                <Stepper.Step label="Logistics" description="Payment & Luggage">
                    <Stack gap="md" mt="lg">
                        <Title order={4}>Logistics</Title>
                        <MultiSelect
                            label="Payment Methods"
                            placeholder="Select accepted methods (Optional)"
                            data={['Cash', 'Venmo', 'Zelle', 'WeChat', 'CashApp']}
                            value={paymentMethods}
                            onChange={setPaymentMethods}
                        />
                        <TextInput
                            label="Payment Handle / ID (Optional)"
                            description="Who should riders pay? (e.g. @username)"
                            placeholder="Venmo: @user, WeChat: user123"
                            value={paymentHandle}
                            onChange={(e) => setPaymentHandle(e.currentTarget.value)}
                        />
                        <Textarea
                            label="Pickup Rules"
                            placeholder="e.g. Wait at the bus stop, look for a red car"
                            value={pickupRules}
                            onChange={(e) => setPickupRules(e.currentTarget.value)}
                            minRows={2}
                        />
                        <Textarea
                            label="Cancellation Policy"
                            placeholder="e.g. Free cancellation up to 24h before departure"
                            value={cancellationPolicy}
                            onChange={(e) => setCancellationPolicy(e.currentTarget.value)}
                            minRows={2}
                        />

                        <Checkbox
                            label="Enable Booking Cutoff"
                            description="Stop accepting bookings X hours before departure"
                            checked={cutoffEnabled}
                            onChange={(e) => setCutoffEnabled(e.currentTarget.checked)}
                            mt="sm"
                        />
                        {cutoffEnabled && (
                            <NumberInput
                                label="Hours before departure"
                                description="e.g. 1.5 for 1 hour 30 mins"
                                placeholder="1"
                                value={cutoffHours}
                                onChange={(val) => setCutoffHours(val === '' ? '' : Number(val))}
                                min={0.1}
                                step={0.5}
                                decimalScale={2}
                                required
                            />
                        )}
                        <Group grow>
                            <NumberInput
                                label="Big Luggage Max"
                                description="Large suitcases"
                                value={bigLuggage}
                                onChange={(val) => setBigLuggage(val === '' ? '' : Number(val))}
                                min={0}
                            />
                            <NumberInput
                                label="Small Luggage Max"
                                description="Carry-ons / Backpacks"
                                value={smallLuggage}
                                onChange={(val) => setSmallLuggage(val === '' ? '' : Number(val))}
                                min={0}
                            />
                        </Group>
                        <Group justify="space-between" mt="md">
                            <Button variant="default" onClick={prevStep}>Back</Button>
                            <Button onClick={nextStep}>Next: Settings</Button>
                        </Group>
                    </Stack>
                </Stepper.Step>

                {/* STEP 5: Settings */}
                <Stepper.Step label="Settings" description="Advanced Rules">
                    <Stack gap="md" mt="lg">
                        <Title order={4}>Advanced Settings</Title>
                        <Select
                            label="Departure Flexibility"
                            description="How long can you wait?"
                            data={['None', '15 minutes', '30 minutes', '1 hour']}
                            value={flexibility}
                            onChange={(val) => setFlexibility(val || '15 minutes')}
                        />
                        <Group grow>
                            <NumberInput
                                label="Pickup Radius (m)"
                                value={pickupRadius}
                                onChange={(val) => setPickupRadius(val === '' ? '' : Number(val))}
                                min={0}
                                step={100}
                            />
                            <NumberInput
                                label="Dropoff Radius (m)"
                                value={dropoffRadius}
                                onChange={(val) => setDropoffRadius(val === '' ? '' : Number(val))}
                                min={0}
                                step={100}
                            />
                        </Group>
                        <Accordion variant="separated">
                            <Accordion.Item value="settings">
                                <Accordion.Control>Advanced Rules</Accordion.Control>
                                <Accordion.Panel>
                                    <Stack gap="md">
                                        <Switch
                                            label="Auto Accept Bookings"
                                            description="Automatically approve requests that meet your criteria"
                                            checked={autoAccept}
                                            onChange={(e) => setAutoAccept(e.currentTarget.checked)}
                                        />
                                    </Stack>
                                </Accordion.Panel>
                            </Accordion.Item>
                        </Accordion>
                        <Textarea
                            label="Trip Notes"
                            placeholder="Any specific instructions? e.g. 'Meeting at the main entrance', 'No pets', etc."
                            minRows={3}
                            value={notes}
                            onChange={(e) => setNotes(e.currentTarget.value)}
                        />
                        <Group justify="space-between" mt="md">
                            <Button variant="default" onClick={prevStep}>Back</Button>
                            <Button color="blue" onClick={handleFinalSubmit}>Post Trip</Button>
                        </Group>
                    </Stack>
                </Stepper.Step>

                <Stepper.Completed>
                    <Stack align="center" mt="lg" gap="md">
                        <Title order={3}>Trip Posted!</Title>
                        <Text>Your trip is now live and bookable.</Text>
                        <Button onClick={() => window.location.reload()}>Post Another</Button>
                    </Stack>
                </Stepper.Completed>
            </Stepper>

            <Modal opened={authModalOpen} onClose={() => setAuthModalOpen(false)} title="Login Required" centered>
                <Stack gap="md">
                    <Text>
                        Your trip details have been saved temporarily. Please log in or create an account to publish your trip.
                        We will restore your progress when you return.
                    </Text>
                    <Group justify="flex-end">
                        <Button variant="default" onClick={() => setAuthModalOpen(false)}>Cancel</Button>
                        <Button onClick={() => {
                            if (user) {
                                setAuthModalOpen(false);
                            } else {
                                handleProtectedAction();
                            }
                        }}>
                            Log In & Continue
                        </Button>
                    </Group>

                </Stack>
            </Modal>
        </Paper>
    );
}
