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
    TagsInput,
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
    Modal,
    Divider,
    SimpleGrid
} from '@mantine/core';
import { useParams } from 'next/navigation';
import { DateTimePicker } from '@mantine/dates';
import { IconMapPin, IconCalendar, IconX, IconCar } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useRouter } from 'next/navigation';
import { useAuth } from '../firebase/AuthContext';
import { getLocalizedHref } from '../LocalizedLink';
import { parseFlexibility, parsePayWindow, parseCutoffTimeNullable, parseStartCheckInNullable } from '@/utils/intervalParsers';

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
    const router = useRouter();
    const params = useParams();
    // Stepper State
    const [active, setActive] = useState(0);

    // Auth Modal State
    const [authModalOpen, setAuthModalOpen] = useState(false);
    const [profileModalOpen, setProfileModalOpen] = useState(false);

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

    // Coords for Template Loading
    const [startCoords, setStartCoords] = useState<{ lat: number, lng: number } | null>(null);
    const [endCoords, setEndCoords] = useState<{ lat: number, lng: number } | null>(null);

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
    const [flexibility, setFlexibility] = useState<number | ''>(0.25);
    const [pickupRadius, setPickupRadius] = useState<number | ''>(1000);
    const [dropoffRadius, setDropoffRadius] = useState<number | ''>(1000);
    const [pickupRules, setPickupRules] = useState('');
    const [cancellationPolicy, setCancellationPolicy] = useState('');
    const [cutoffEnabled, setCutoffEnabled] = useState(true);
    const [cutoffHours, setCutoffHours] = useState<number | '' | null>(3);
    const [notes, setNotes] = useState('');
    const [saveTemplate, setSaveTemplate] = useState(false);
    const [saveTripTemplate, setSaveTripTemplate] = useState(false);
    const [linkTemplates, setLinkTemplates] = useState(false);
    const [ruleTemplateName, setRuleTemplateName] = useState('');
    const [tripTemplateName, setTripTemplateName] = useState('');
    const [payWindow, setPayWindow] = useState<number | ''>(60); // Default 60 mins
    const [startCheckInEnabled, setStartCheckInEnabled] = useState(true);
    const [startCheckInHrs, setStartCheckInHrs] = useState<number | ''>(3);

    const [templates, setTemplates] = useState<any[]>([]);
    const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

    // Trip Templates State
    const [tripTemplates, setTripTemplates] = useState<any[]>([]);
    const [selectedTripTemplate, setSelectedTripTemplate] = useState<string | null>(null);
    const [fieldSources, setFieldSources] = useState<Record<string, 'default' | 'template' | 'manual'>>({});
    const [fieldSourceInfos, setFieldSourceInfos] = useState<Record<string, { type: 'Trip' | 'Rule'; name: string }>>({});

    const hasFetchedTemplates = useRef(false);
    const hasFetchedTripTemplates = useRef(false);

    const [postedLink, setPostedLink] = useState<string>('');

    const setFieldSourceManual = (fields: string[]) => {
        setFieldSources(prev => {
            const next = { ...prev };
            fields.forEach(f => next[f] = 'manual');
            return next;
        });
        setFieldSourceInfos(prev => {
            const next = { ...prev };
            fields.forEach(f => delete next[f]);
            return next;
        });
    };

    const setFieldSourceTemplate = (fields: string[], type: 'Trip' | 'Rule', name: string) => {
        setFieldSources(prev => {
            const next = { ...prev };
            fields.forEach(f => next[f] = 'template');
            return next;
        });
        setFieldSourceInfos(prev => {
            const next = { ...prev };
            fields.forEach(f => next[f] = { type, name });
            return next;
        });
    };

    const renderSourceBadge = (field: string) => {
        if (fieldSources[field] === 'template' && fieldSourceInfos[field]) {
            const info = fieldSourceInfos[field];
            return <Badge size="xs" variant="light" color={info.type === 'Trip' ? 'blue' : 'green'}>{info.type} template: {info.name}</Badge>;
        }
        return null;
    };

    // Fetch Rule Templates (Step 4)
    useEffect(() => {
        if (user && active === 3 && !hasFetchedTemplates.current) {
            user.getIdToken().then(token => {
                fetch('/api/user/rule-templates', { headers: { 'Authorization': `Bearer ${token}` } })
                    .then(res => res.json())
                    .then(data => {
                        if (data.templates) setTemplates(data.templates);
                        hasFetchedTemplates.current = true;
                    })
                    .catch(err => console.error("Failed to fetch templates", err));
            });
        }
    }, [user, active]);

    // Fetch Trip Templates (Step 1)
    useEffect(() => {
        if (user && active === 0 && !hasFetchedTripTemplates.current) {
            user.getIdToken().then(token => {
                fetch('/api/user/trip-templates', { headers: { 'Authorization': `Bearer ${token}` } })
                    .then(res => res.json())
                    .then(data => {
                        if (data.templates) setTripTemplates(data.templates);
                        hasFetchedTripTemplates.current = true;
                    })
                    .catch(err => console.error("Failed to fetch trip templates", err));
            });
        }
    }, [user, active]);

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
        flexibility: number | '';

        pickupRadius: number | '';
        dropoffRadius: number | '';
        pickupRules: string;
        cancellationPolicy: string;
        cutoffEnabled: boolean;
        cutoffHours: number | '' | null;
        payWindow: number | '';
        notes: string;
        startPlaceId: string | null;
        endPlaceId: string | null;
        startCheckInEnabled: boolean;
        startCheckInHrs: number | '';
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
                if (draft.autoAccept !== undefined) setAutoAccept(draft.autoAccept);
                if (draft.flexibility !== undefined && (typeof draft.flexibility === 'number' || draft.flexibility === '')) {
                    setFlexibility(draft.flexibility);
                }
                if (draft.pickupRadius !== undefined) setPickupRadius(draft.pickupRadius);
                if (draft.dropoffRadius !== undefined) setDropoffRadius(draft.dropoffRadius);
                if (draft.pickupRules) setPickupRules(draft.pickupRules);
                if (draft.cancellationPolicy) setCancellationPolicy(draft.cancellationPolicy);
                if (draft.cutoffEnabled !== undefined) setCutoffEnabled(draft.cutoffEnabled);
                if (draft.cutoffHours !== undefined) setCutoffHours(draft.cutoffHours);
                if (draft.payWindow !== undefined) setPayWindow(draft.payWindow);
                if (draft.notes) setNotes(draft.notes);

                // Backwards compatibility for draft loading might be needed if user has old draft format
                // But TypeScript might complain if we check property that doesn't exist on Type?
                // Cast to any to check just in case or just assume new drafts going forward
                const d = draft as any;
                if (d.startCheckInEnabled !== undefined) {
                    setStartCheckInEnabled(d.startCheckInEnabled);
                    if (d.startCheckInHrs !== undefined) setStartCheckInHrs(d.startCheckInHrs);
                } else if (d.startCheckInHrs !== undefined && d.startCheckInHrs !== null) {
                    // Old format: startCheckInHrs was number or null. If number, it was enabled.
                    setStartCheckInEnabled(true);
                    setStartCheckInHrs(d.startCheckInHrs);
                }


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
                    (draft.flexibility !== 0.25 && !!draft.flexibility) ||
                    (draft.pickupRadius !== 1000 && draft.pickupRadius !== '' && draft.pickupRadius !== undefined) ||
                    (draft.dropoffRadius !== 1000 && draft.dropoffRadius !== '' && draft.dropoffRadius !== undefined) ||
                    (!!draft.pickupRules) ||
                    (!!draft.cancellationPolicy) ||
                    (draft.cutoffEnabled !== true) ||
                    (draft.payWindow !== 60 && draft.payWindow !== '' && draft.payWindow !== undefined) ||
                    (!!draft.notes) ||
                    (draft.startCheckInEnabled !== true) ||
                    (draft.cutoffHours !== 3 && draft.cutoffHours !== undefined) ||
                    (draft.startCheckInHrs !== 3 && draft.startCheckInHrs !== undefined);

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

    // --- Reset Logic ---
    const resetForm = () => {
        setActive(0);
        setStartLocation('');
        setEndLocation('');
        setStartTime(null);
        setIsStartSelected(false);
        setIsEndSelected(false);
        startLastSelection.current = '';
        endLastSelection.current = '';
        setStartPlaceId(null);
        setEndPlaceId(null);
        setStartCoords(null);
        setEndCoords(null);
        setPrice('');
        setSeats(1);
        setSelectedCarId('new');
        setCarMake('');
        setCarModel('');
        setCarColor('');
        setCarYear('');
        setCarPlate('');
        setCarBigLuggage('');
        setCarSmallLuggage('');
        setCarSeats('');
        setPaymentMethods([]);
        setPaymentHandle('');
        setBigLuggage(0);
        setSmallLuggage(0);
        setAutoAccept(true);
        setFlexibility(0.25);
        setPickupRadius(1000);
        setDropoffRadius(1000);
        setPickupRules('');
        setCancellationPolicy('');
        setCutoffEnabled(true);
        setCutoffHours(3);
        setNotes('');
        setSaveTemplate(false);
        setSaveTripTemplate(false);
        setLinkTemplates(false);
        setRuleTemplateName('');
        setTripTemplateName('');
        setPayWindow(60);
        setStartCheckInEnabled(true);
        setStartCheckInHrs(3);
        setSelectedTemplate(null);
        setSelectedTripTemplate(null);
        setPostedLink('');
        setFieldSources({});
        setFieldSourceInfos({});
        // Also clear draft from local storage to be safe
        localStorage.removeItem('trip_draft');
    };

    // Auto-Redirect Timer
    const [redirectCountdown, setRedirectCountdown] = useState(10);

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (active === 5 && postedLink) {
            setRedirectCountdown(10);
            interval = setInterval(() => {
                setRedirectCountdown((prev) => {
                    if (prev <= 1) {
                        clearInterval(interval);
                        router.push(postedLink);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [active, postedLink, router]);

    // Save Draft Effect (Debounced)
    useEffect(() => {
        // DO NOT SAVE if we are on the completion step (active === 5)
        if (active === 5) return;

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
                payWindow,
                notes,
                startPlaceId,
                endPlaceId,
                startCheckInEnabled,
                startCheckInHrs
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
        cutoffHours, payWindow, notes, startPlaceId, endPlaceId, startCheckInHrs
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
            if (!isStartSelected || (!startPlaceId && !startCoords)) {
                notifications.show({ title: 'Invalid Start', message: 'Please select a valid start location from the dropdown menu.', color: 'red' });
                return;
            }
            if (!isEndSelected || (!endPlaceId && !endCoords)) {
                notifications.show({ title: 'Invalid Destination', message: 'Please select a valid destination from the dropdown menu.', color: 'red' });
                return;
            }
            if (!startTime) {
                notifications.show({ title: 'Date Required', message: 'Please select a departure time.', color: 'red' });
                return;
            }
            if (startTime < new Date()) {
                notifications.show({ title: 'Invalid Date', message: 'Departure time cannot be in the past.', color: 'red' });
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
            // Step 3: Vehicle
            // Allow processing if "No Vehicle" is selected
            if (selectedCarId === 'none') {
                setActive(current => current + 1);
                return;
            }

            let carCapacity = 0;
            if (selectedCarId === 'new') {
                const isAnyFieldFilled = carMake.trim() || carModel.trim() || carColor.trim() || carYear.trim() || carPlate.trim() || carBigLuggage !== '' || carSmallLuggage !== '' || carSeats !== '';

                if (isAnyFieldFilled) {
                    if (carSeats === '' || carSeats < 1) {
                        notifications.show({ title: 'Car Seats Required', message: 'If you are adding a vehicle, please specify the number of seats.', color: 'red' });
                        return;
                    }
                    carCapacity = Number(carSeats);
                }
            } else {
                // Existing Car
                const car = savedCars.find(c => c.id === selectedCarId);
                if (car && car.seats) {
                    carCapacity = car.seats;
                }
            }

            // Validate Seats vs Car Capacity
            if (carCapacity > 0 && Number(seats) > carCapacity) {
                notifications.show({
                    title: 'Capacity Exceeded',
                    message: `Vehicle's capacity (${carCapacity}) cannot be less than the trip's seats (${seats}).`,
                    color: 'red'
                });
                return;
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

            // Validate Luggage Limits against Car Capacity
            if (selectedCarId !== 'none') {
                let carBigCap: number | null = null;
                let carSmallCap: number | null = null;

                if (selectedCarId === 'new') {
                    if (carBigLuggage !== '' && carBigLuggage !== undefined) carBigCap = Number(carBigLuggage);
                    if (carSmallLuggage !== '' && carSmallLuggage !== undefined) carSmallCap = Number(carSmallLuggage);
                } else {
                    const car = savedCars.find(c => c.id === selectedCarId);
                    if (car) {
                        if (car.big_luggage !== undefined && car.big_luggage !== null) carBigCap = car.big_luggage;
                        if (car.small_luggage !== undefined && car.small_luggage !== null) carSmallCap = car.small_luggage;
                    }
                }

                if (carBigCap !== null && Number(bigLuggage || 0) > carBigCap) {
                    notifications.show({
                        title: 'Luggage Check Reminder',
                        message: `Big luggage limit (${bigLuggage || 0}) exceeds car capacity (${carBigCap}). Go back to adjust luggage limits to prevent overloading the car.`,
                        color: 'red',
                        autoClose: false
                    });
                }
                if (carSmallCap !== null && Number(smallLuggage || 0) > carSmallCap) {
                    notifications.show({
                        title: 'Luggage Check Reminder',
                        message: `Small luggage limit (${smallLuggage || 0}) exceeds car capacity (${carSmallCap}). Go back to adjust luggage limits to prevent overloading the car.`,
                        color: 'red',
                        autoClose: false
                    });
                }
            }

            // Required Field Validation
            if (bigLuggage === '') {
                notifications.show({ title: 'Big Luggage Limit Required', message: 'Please specify big luggage capacity (or 0).', color: 'red' });
                return;
            }
            if (smallLuggage === '') {
                notifications.show({ title: 'Small Luggage Limit Required', message: 'Please specify small luggage capacity (or 0).', color: 'red' });
                return;
            }
        }

        setActive((current) => (current < 5 ? current + 1 : active));
    };

    const prevStep = () => setActive((current) => (current > 0 ? current - 1 : current));

    const handleFinalSubmit = async () => {
        // Validation: Template Name if Saving (Rule or Trip)
        if (saveTemplate && !ruleTemplateName.trim()) {
            notifications.show({ title: 'Template Name Required', message: 'Please provide a name for your Rule Template.', color: 'red' });
            return;
        }
        if (saveTripTemplate && !tripTemplateName.trim()) {
            notifications.show({ title: 'Template Name Required', message: 'Please provide a name for your Trip Template.', color: 'red' });
            return;
        }

        // Validation for Advanced Settings (Step 5)
        if (flexibility === '') {
            notifications.show({ title: 'Flexibility Required', message: 'Please specify departure flexibility.', color: 'red' });
            return;
        }
        if (pickupRadius === '') {
            notifications.show({ title: 'Pickup Radius Required', message: 'Please specify pickup radius.', color: 'red' });
            return;
        }
        if (dropoffRadius === '') {
            notifications.show({ title: 'Drop-off Radius Required', message: 'Please specify drop-off radius.', color: 'red' });
            return;
        }
        if (payWindow === '') {
            notifications.show({ title: 'Pay Window Required', message: 'Please specify the pay window duration.', color: 'red' });
            return;
        }
        if (cutoffEnabled && (cutoffHours === '' || cutoffHours === null || cutoffHours <= 0)) {
            notifications.show({ title: 'Invalid Cutoff Time', message: 'Please enter a valid number of hours for booking cutoff.', color: 'red' });
            return;
        }

        // 1. Handle Unauthenticated User
        if (!user) {
            // Draft is already saved by the useEffect, but we can ensure it's up to date if we wanted.
            // Since useEffect handles it, we just open the modal.
            setAuthModalOpen(true);
            return;
        }

        const payload: any = {
            start: {
                text: startLocation,
                placeId: startPlaceId,
                lat: startCoords?.lat,
                lng: startCoords?.lng,
                sessionToken: startSessionToken.current
            },
            end: {
                text: endLocation,
                placeId: endPlaceId,
                lat: endCoords?.lat,
                lng: endCoords?.lng,
                sessionToken: endSessionToken.current
            },
            departureTime: startTime,
            price: Number(price),
            seats: Number(seats),
            paymentMethods,
            paymentHandle,
            bigLuggage: Number(bigLuggage),
            smallLuggage: Number(smallLuggage),
            autoAccept,
            flexibility: (flexibility !== undefined) ? `${flexibility} hours` : '0 hours',
            pickupRadius: Number(pickupRadius),
            dropoffRadius: Number(dropoffRadius),
            pickupRules,
            cancellationPolicy,
            cutoffTime: (cutoffEnabled && cutoffHours !== '' && cutoffHours !== null) ? `${cutoffHours} hours` : '0 hours',
            payWindow: (payWindow !== undefined) ? `${payWindow} minutes` : '30 minutes',
            notes,
            saveTemplate,
            saveTripTemplate,
            linkTemplates,
            ruleTemplateName,
            tripTemplateName,
            startCheckInHrs: (startCheckInHrs !== '' && startCheckInHrs !== null && startCheckInHrs !== undefined) ? `${startCheckInHrs} hours` : null,
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

            if (!res.ok) {
                if (data.code === 'PROFILE_INCOMPLETE') {
                    setProfileModalOpen(true);
                    return;
                }
                throw new Error(data.error || 'Failed to create trip');
            }

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

            setPostedLink(getLocalizedHref(params, `/rides/${data.tripId}`));

            // Trigger push permission prompt (might be nice to ask driver too)
            window.dispatchEvent(new Event('show-push-permission-modal'));

            nextStep();

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
            <Stepper
                active={active}
                onStepClick={(index) => active !== 5 && setActive(index)}
                allowNextStepsSelect={false}
            >

                {/* STEP 1: Route & Date */}
                <Stepper.Step label="Route" description="Where & When">
                    <Stack gap="md" mt="lg">
                        {tripTemplates.length > 0 && (
                            <Select
                                label="Load from Template"
                                placeholder="Select a saved trip..."
                                data={tripTemplates.map(t => ({ value: t.id, label: t.name || 'Untitled Trip' }))}
                                value={selectedTripTemplate}
                                onChange={(val) => {
                                    setSelectedTripTemplate(val);
                                    if (val) {
                                        const t = tripTemplates.find(x => x.id === val);
                                        if (t) {
                                            const tName = t.name || 'Trip Template';
                                            // Prefill Logic

                                            if (t.from_text && t.from_text !== '') {
                                                setStartLocation(t.from_text);
                                                setStartCoords({ lat: t.origin_lat, lng: t.origin_lng });
                                                setIsStartSelected(true);
                                                setStartPlaceId(t.from_place_id);
                                            }

                                            if (t.to_text && t.to_text !== '') {
                                                setEndLocation(t.to_text);
                                                setEndCoords({ lat: t.dest_lat, lng: t.dest_lng });
                                                setIsEndSelected(true);
                                                setEndPlaceId(t.to_place_id);
                                            }

                                            setPrice(Number(t.price));
                                            setSeats(Number(t.total_seats));
                                            setNotes(t.notes);

                                            setLoadingStart(false);
                                            setLoadingEnd(false);

                                            if (t.car) setSelectedCarId(t.car);

                                            // Rule Prefill if exists
                                            if (t.rule_details) {
                                                const r = t.rule_details;
                                                setBigLuggage(r.big_luggage_lim ?? '');
                                                setSmallLuggage(r.small_luggage_lim ?? '');
                                                setPaymentMethods(r.payment_methods || []);
                                                setPaymentHandle(r.payment_handle || '');
                                                setAutoAccept(r.auto_accept);
                                                setFlexibility(r.departure_time_flexibility ? parseFlexibility(r.departure_time_flexibility) : 0.25);
                                                setPickupRadius(r.pickup_radius_meters || 1000);
                                                setDropoffRadius(r.drop_off_radius_meters || 1000);
                                                setPickupRules(r.pickup_rules || '');
                                                setCancellationPolicy(r.cancellation_policy || '');
                                                const ch = parseCutoffTimeNullable(r.cutoff_time);
                                                if (ch !== null) {
                                                    setCutoffEnabled(true);
                                                    setCutoffHours(ch);
                                                } else {
                                                    setCutoffEnabled(false);
                                                    setCutoffHours(null); // or 3 if we want default when re-enabling
                                                }
                                                setPayWindow(r.pay_window ? parsePayWindow(r.pay_window) : 60);

                                                const sch = parseStartCheckInNullable(r.start_check_in_hrs_before_departure);
                                                if (sch) {
                                                    setStartCheckInEnabled(true);
                                                    setStartCheckInHrs(sch);
                                                } else {
                                                    setStartCheckInEnabled(false);
                                                    setStartCheckInHrs(3);
                                                }
                                                setFieldSourceTemplate([
                                                    'bigLuggage', 'smallLuggage', 'paymentMethods', 'paymentHandle', 'autoAccept',
                                                    'flexibility', 'pickupRadius', 'dropoffRadius', 'pickupRules', 'cancellationPolicy', 'cutoffHours', 'payWindow', 'startCheckInHrs'
                                                ], 'Trip', tName);
                                            }

                                            setFieldSourceTemplate(['startLocation', 'endLocation', 'price', 'seats', 'notes', 'selectedCarId'], 'Trip', tName);
                                        }
                                    }
                                }}
                            />
                        )}

                        <Title order={4}>Trip Route</Title>
                        <Autocomplete
                            label={<Group gap="xs">From {renderSourceBadge('startLocation')}</Group>}
                            placeholder="Starting Location"
                            leftSection={<IconMapPin size={16} />}
                            data={startSuggestions}
                            value={startLocation}
                            required
                            onChange={(val) => {
                                handleStartChange(val);
                                setFieldSourceManual(['startLocation']);
                            }}
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
                            label={<Group gap="xs">To {renderSourceBadge('endLocation')}</Group>}
                            placeholder="Destination"
                            leftSection={<IconMapPin size={16} />}
                            data={endSuggestions}
                            value={endLocation}
                            required
                            onChange={(val) => {
                                handleEndChange(val);
                                setFieldSourceManual(['endLocation']);
                            }}
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
                            required
                            minDate={new Date()}
                            valueFormat="MM/DD/YYYY HH:mm"
                            onChange={(val) => {
                                setStartTime(val as Date | null);
                            }}
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
                            label={<Group gap="xs">Price per Person ($) {renderSourceBadge('price')}</Group>}
                            placeholder="25.00"
                            prefix="$ "
                            decimalScale={2}
                            fixedDecimalScale
                            value={price}
                            onChange={(val) => {
                                setPrice(val === '' ? '' : Number(val));
                                setFieldSourceManual(['price']);
                            }}
                            min={0}
                            required
                        />
                        <NumberInput
                            label={<Group gap="xs">Total Seats Available {renderSourceBadge('seats')}</Group>}
                            description="How many passengers can you take?"
                            value={seats}
                            onChange={(val) => {
                                setSeats(val === '' ? '' : Number(val));
                                setFieldSourceManual(['seats']);
                            }}
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
                                onChange={(val) => {
                                    setSelectedCarId(val);
                                    setFieldSourceManual(['selectedCarId']);
                                }}
                                label={<Group gap="xs">Select a Saved Vehicle {renderSourceBadge('selectedCarId')}</Group>}
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
                                                        <Badge color={'black'} variant="light">{car.color}</Badge>
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
                                    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
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
                                    </SimpleGrid>
                                    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
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
                                    </SimpleGrid>
                                    <TextInput
                                        label="License Plate"
                                        placeholder="Optional"
                                        value={carPlate}
                                        onChange={(e) => setCarPlate(e.currentTarget.value)}
                                    />



                                    <Divider label="Templates" labelPosition="center" />
                                    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                                        <NumberInput
                                            label="Total Big Luggage Cap."
                                            value={carBigLuggage}
                                            onChange={(val) => setCarBigLuggage(val === '' ? '' : Number(val))}
                                            min={0}
                                        />
                                        <NumberInput
                                            label="Total Small Luggage Cap."
                                            value={carSmallLuggage}
                                            onChange={(val) => setCarSmallLuggage(val === '' ? '' : Number(val))}
                                            min={0}
                                        />
                                    </SimpleGrid>
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

                        {/* Load Template Section */}
                        {templates.length > 0 && (
                            <Paper withBorder p="sm" bg="gray.0">
                                <Select
                                    label="Load Saved Template"
                                    placeholder="Select a rule template to prefill"
                                    data={templates.map(t => ({ value: t.id, label: t.name || 'Unnamed Template' }))}
                                    value={selectedTemplate}
                                    onChange={(val) => {
                                        setSelectedTemplate(val);
                                        const t = templates.find(temp => temp.id === val);
                                        if (t) {
                                            if (t.payment_methods) setPaymentMethods(t.payment_methods);
                                            if (t.payment_handle) setPaymentHandle(t.payment_handle);
                                            if (t.pickup_rules) setPickupRules(t.pickup_rules);
                                            if (t.cancellation_policy) setCancellationPolicy(t.cancellation_policy);
                                            if (t.auto_accept !== undefined) setAutoAccept(t.auto_accept);
                                            if (t.big_luggage_lim !== null) setBigLuggage(t.big_luggage_lim);
                                            if (t.small_luggage_lim !== null) setSmallLuggage(t.small_luggage_lim);
                                            if (t.pickup_radius_meters !== null) setPickupRadius(t.pickup_radius_meters);
                                            if (t.drop_off_radius_meters !== null) setDropoffRadius(t.drop_off_radius_meters);

                                            // Cutoff
                                            const ch = parseCutoffTimeNullable(t.cutoff_time);
                                            if (ch !== null) {
                                                setCutoffEnabled(true);
                                                setCutoffHours(ch);
                                            } else {
                                                setCutoffEnabled(false);
                                                setCutoffHours(null);
                                            }

                                            // Pay Window
                                            if (t.pay_window) {
                                                const pw = parsePayWindow(t.pay_window);
                                                if (!isNaN(pw)) setPayWindow(pw);
                                            }

                                            // Start Check-in
                                            if (t.start_check_in_hrs_before_departure) {
                                                const sch = parseStartCheckInNullable(t.start_check_in_hrs_before_departure);
                                                if (sch) {
                                                    setStartCheckInEnabled(true);
                                                    setStartCheckInHrs(sch);
                                                } else {
                                                    setStartCheckInEnabled(false);
                                                    setStartCheckInHrs(3);
                                                }
                                            } else {
                                                setStartCheckInEnabled(false);
                                                setStartCheckInHrs(3);
                                            }

                                            // Flexibility
                                            if (t.departure_time_flexibility) {
                                                setFlexibility(parseFlexibility(t.departure_time_flexibility));

                                                setFieldSourceTemplate([
                                                    'paymentMethods', 'paymentHandle', 'pickupRules', 'cancellationPolicy', 'autoAccept',
                                                    'bigLuggage', 'smallLuggage', 'pickupRadius', 'dropoffRadius', 'flexibility', 'cutoffHours', 'payWindow', 'startCheckInHrs'
                                                ], 'Rule', t.name || 'Rule Template');

                                                notifications.show({ title: 'Template Loaded', message: 'Rules have been populated from template.', color: 'green' });
                                            }
                                        }
                                    }}
                                    clearable
                                />
                            </Paper>
                        )}

                        <TagsInput
                            label={<Group gap="xs">Payment Methods {renderSourceBadge('paymentMethods')}</Group>}
                            placeholder="Select or type accepted methods. Leaving empty = None accepted."
                            data={['Cash', 'Venmo', 'Zelle', 'WeChat', 'CashApp']}
                            value={paymentMethods}
                            onChange={(val) => {
                                setPaymentMethods(val);
                                setFieldSourceManual(['paymentMethods']);
                            }}
                            clearable
                        />
                        <TextInput
                            label={<Group gap="xs">Payment Handle / ID {renderSourceBadge('paymentHandle')}</Group>}
                            description="Who should riders pay? (e.g. @username)"
                            placeholder="Venmo: @user, WeChat: user123"
                            value={paymentHandle}
                            onChange={(e) => {
                                setPaymentHandle(e.currentTarget.value);
                                setFieldSourceManual(['paymentHandle']);
                            }}
                        />
                        <Textarea
                            label={<Group gap="xs">Pickup Rules {renderSourceBadge('pickupRules')}</Group>}
                            placeholder="e.g. Wait at the bus stop, look for a red car"
                            value={pickupRules}
                            onChange={(e) => {
                                setPickupRules(e.currentTarget.value);
                                setFieldSourceManual(['pickupRules']);
                            }}
                            minRows={2}
                        />
                        <Textarea
                            label={<Group gap="xs">Cancellation Policy {renderSourceBadge('cancellationPolicy')}</Group>}
                            placeholder="e.g. Free cancellation up to 24h before departure"
                            value={cancellationPolicy}
                            onChange={(e) => {
                                setCancellationPolicy(e.currentTarget.value);
                                setFieldSourceManual(['cancellationPolicy']);
                            }}
                            minRows={2}
                        />


                        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                            <NumberInput
                                label={<Group gap="xs">Big Luggage Cap. Per Person {renderSourceBadge('bigLuggage')}</Group>}
                                description="Large suitcases"
                                value={bigLuggage}
                                required
                                onChange={(val) => {
                                    setBigLuggage(val === '' ? '' : Number(val));
                                    setFieldSourceManual(['bigLuggage']);
                                }}
                                min={0}
                            />
                            <NumberInput
                                label={<Group gap="xs">Small Luggage Cap. Per Person {renderSourceBadge('smallLuggage')}</Group>}
                                description="Carry-ons"
                                value={smallLuggage}
                                required
                                onChange={(val) => {
                                    setSmallLuggage(val === '' ? '' : Number(val));
                                    setFieldSourceManual(['smallLuggage']);
                                }}
                                min={0}
                            />
                        </SimpleGrid>
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
                        <NumberInput
                            label={<Group gap="xs">Departure Flexibility (Hours) {renderSourceBadge('flexibility')}</Group>}
                            description="How long might you leave early or late? Riders will search and book within this time range."
                            required
                            value={flexibility}
                            onChange={(val) => {
                                setFlexibility(val === '' ? '' : Number(val));
                                setFieldSourceManual(['flexibility']);
                            }}
                            min={0}
                            step={0.25}
                        />
                        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                            <NumberInput
                                label={<Group gap="xs">Pickup Radius (m) {renderSourceBadge('pickupRadius')}</Group>}
                                value={pickupRadius}
                                onChange={(val) => {
                                    setPickupRadius(val === '' ? '' : Number(val));
                                    setFieldSourceManual(['pickupRadius']);
                                }}
                                min={0}
                                description="The area around your departure location where you are willing to pick up passengers"
                                required
                                step={100}
                            />
                            <NumberInput
                                label={<Group gap="xs">Dropoff Radius (m) {renderSourceBadge('dropoffRadius')}</Group>}
                                value={dropoffRadius}
                                onChange={(val) => {
                                    setDropoffRadius(val === '' ? '' : Number(val));
                                    setFieldSourceManual(['dropoffRadius']);
                                }}
                                min={0}
                                description="The area around your arrival location where you are willing to drop off passengers"
                                required
                                step={100}
                            />
                        </SimpleGrid>
                        <Accordion variant="separated">
                            <Accordion.Item value="settings">
                                <Accordion.Control>Advanced Rules</Accordion.Control>
                                <Accordion.Panel>
                                    <Stack gap="md">
                                        <Switch
                                            label={<Group gap="xs">Auto Accept Bookings {renderSourceBadge('autoAccept')}</Group>}
                                            description="Automatically approve requests that meet your criteria"
                                            checked={autoAccept}
                                            onChange={(e) => {
                                                setAutoAccept(e.currentTarget.checked);
                                                setFieldSourceManual(['autoAccept']);
                                            }}
                                        />
                                        <Switch
                                            label={<Group gap="xs">Auto Start Check-in {renderSourceBadge('startCheckInHrs')}</Group>}
                                            description="Automatically ask passengers to check-in before the trip starts. Upon departure, check-in will begin automatically."
                                            checked={startCheckInEnabled}
                                            onChange={(e) => {
                                                setStartCheckInEnabled(e.currentTarget.checked);
                                                setStartCheckInHrs(e.currentTarget.checked ? 3 : '');
                                                setFieldSourceManual(['startCheckInHrs']);
                                            }}
                                        />
                                        {startCheckInEnabled && (
                                            <NumberInput
                                                label="Start Check-in (Hours before departure)"
                                                value={startCheckInHrs}
                                                placeholder='3'
                                                onChange={(val) => {
                                                    setStartCheckInHrs(val === '' ? '' : Number(val));
                                                    setFieldSourceManual(['startCheckInHrs']);
                                                }}
                                                min={1}
                                            />
                                        )}

                                        <Switch
                                            label="Enable Booking Cutoff"
                                            description="Stop accepting bookings X hours before departure"
                                            checked={cutoffEnabled}
                                            onChange={(e) => {
                                                setCutoffEnabled(e.currentTarget.checked);
                                                setCutoffHours(e.currentTarget.checked ? 3 : null);
                                            }}
                                        />
                                        {cutoffEnabled && (
                                            <NumberInput
                                                label={<Group gap="xs">Hours before departure {renderSourceBadge('cutoffHours')}</Group>}
                                                description="e.g. 1.5 for 1 hour 30 mins"
                                                placeholder="3"
                                                value={cutoffHours === null ? '' : cutoffHours}
                                                onChange={(val) => {
                                                    setCutoffHours(val === '' ? '' : Number(val));
                                                    setFieldSourceManual(['cutoffHours']);
                                                }}
                                                min={0.1}
                                                decimalScale={2}
                                            />
                                        )}

                                        <Divider />

                                        <NumberInput
                                            label={<Group gap="xs">Pay Window (Minutes) {renderSourceBadge('payWindow')}</Group>}
                                            description="Time allowed for rider to pay after approval"
                                            value={payWindow}
                                            onChange={(val) => {
                                                setPayWindow(val === '' ? '' : Number(val));
                                                setFieldSourceManual(['payWindow']);
                                            }}
                                            required
                                            min={5}
                                            step={5}
                                        />
                                    </Stack>
                                </Accordion.Panel>
                            </Accordion.Item>
                        </Accordion>
                        <Textarea
                            label={<Group gap="xs">Trip Notes {renderSourceBadge('notes')}</Group>}
                            placeholder="Any specific instructions? e.g. 'Meeting at the main entrance', 'No pets', etc."
                            minRows={3}
                            value={notes}
                            onChange={(e) => {
                                setNotes(e.currentTarget.value);
                                setFieldSourceManual(['notes']);
                            }}
                        />

                        <Divider />

                        <Checkbox
                            label="Save logistics and rules (Rule Template)"
                            checked={saveTemplate}
                            onChange={(e) => setSaveTemplate(e.currentTarget.checked)}
                        />
                        <Checkbox
                            label="Save entire trip details (Trip Template)"
                            checked={saveTripTemplate}
                            onChange={(e) => setSaveTripTemplate(e.currentTarget.checked)}
                        />

                        {(saveTemplate && saveTripTemplate) && (
                            <Checkbox
                                label="Link Rule Template to Trip Template"
                                description="Associate this rule set with the trip template for automatic loading."
                                checked={linkTemplates}
                                onChange={(e) => setLinkTemplates(e.currentTarget.checked)}
                                ml="xl"
                            />
                        )}

                        {saveTemplate && (
                            <TextInput
                                label="Rule Template Name"
                                placeholder="e.g. Standard Rules"
                                value={ruleTemplateName}
                                onChange={(e) => setRuleTemplateName(e.currentTarget.value)}
                                required
                            />
                        )}

                        {saveTripTemplate && (
                            <TextInput
                                label="Trip Template Name"
                                placeholder="e.g. Daily Commute"
                                value={tripTemplateName}
                                onChange={(e) => setTripTemplateName(e.currentTarget.value)}
                                required
                            />
                        )}

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
                        <Text size="sm" c="dimmed">Redirecting to your post in {redirectCountdown}s...</Text>
                        <Group>
                            <Button variant="outline" onClick={resetForm}>Start New Draft</Button>
                            <Button onClick={() => { localStorage.removeItem('trip_draft'); router.push(postedLink) }}>View Post</Button>
                        </Group>
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

            <Modal opened={profileModalOpen} onClose={() => setProfileModalOpen(false)} title="Complete Your Profile" centered>
                <Stack gap="md">
                    <Text>
                        Your progress has been saved. Please complete your profile to publish your trip.
                    </Text>
                    <Group justify="flex-end">
                        <Button variant="default" onClick={() => setProfileModalOpen(false)}>Cancel</Button>
                        <Button onClick={() => {
                            router.push('/complete-profile?returnUrl=/newRide');
                        }}>
                            Go to Profile
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Paper>
    );
}
