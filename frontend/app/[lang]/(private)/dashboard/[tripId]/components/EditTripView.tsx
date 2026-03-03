import { useState, useEffect, useRef } from 'react';
import { compressImage } from '@/utils/compressImage';
import { Button, NumberInput, Stack, Textarea, Group, Switch, Select, Alert, MultiSelect, SimpleGrid, Title, Divider, Autocomplete, Loader, ActionIcon, TextInput, TagsInput, Accordion, Text, Anchor, FileButton, Image, Paper, Input } from '@mantine/core';
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications';
import { toDateTimeLocalString, fromDateTimeLocalString } from '@/utils/dateUtils';
import { useAuth } from '@/components/firebase/AuthContext';
import { IconCheck, IconAlertTriangle, IconCalendar, IconCar, IconMapPin, IconCurrencyDollar, IconScript, IconX, IconLock, IconQrcode, IconUpload, IconTrash } from '@tabler/icons-react';
import { parseFlexibility, parsePayWindow, parseCutoffTimeNullable, parseStartCheckInNullable, parseFlexibilityNullable, parseCutoffTime } from '@/utils/intervalParsers';
import { toChicagoISO, fromChicagoISO, getChicagoNow } from '@/utils/dateUtils';
import { LocalizedLink } from '@/components/LocalizedLink';
import { RadiusMap } from '@/components/Rides/RadiusMap';
import { useTranslation, Trans } from 'react-i18next';
import { DEFAULT_AUTOCOMPLETE_LOCATIONS } from '@/utils/defaultLocations';

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

    // State for Map Coordinates (initialized from trip, updated by Autocomplete)
    const [originCoords, setOriginCoords] = useState<{ lat: number, lng: number } | null>(trip.origin ? { lat: trip.origin.lat, lng: trip.origin.lng } : null);
    const [destCoords, setDestCoords] = useState<{ lat: number, lng: number } | null>(trip.destination ? { lat: trip.destination.lat, lng: trip.destination.lng } : null);

    const startSessionToken = useRef<string>(typeof crypto !== 'undefined' ? crypto.randomUUID() : '');
    const endSessionToken = useRef<string>(typeof crypto !== 'undefined' ? crypto.randomUUID() : '');
    const predictionsMap = useRef<Map<string, string>>(new Map());

    const debounceTimeout = useRef<NodeJS.Timeout | null>(null);

    // Payment QR codes state: stores base64 (new) or URL (existing) for each payment method
    const [paymentQRCodes, setPaymentQRCodes] = useState<Record<string, string>>(
        trip.rules?.payment?.qr_codes || {}
    );

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
        departure_time: t.departure_time ? fromChicagoISO(t.departure_time) : null,
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
        bigLuggagePaid: Number(t.rules.luggage.big_paid ?? 0),
        smallLuggagePaid: Number(t.rules.luggage.small_paid ?? 0),
        bigLuggagePaidPrice: Number(t.rules.luggage.big_paid_price ?? 0),
        smallLuggagePaidPrice: Number(t.rules.luggage.small_paid_price ?? 0),

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
            // Reset coords
            setOriginCoords(trip.origin ? { lat: trip.origin.lat, lng: trip.origin.lng } : null);
            setDestCoords(trip.destination ? { lat: trip.destination.lat, lng: trip.destination.lng } : null);
            // Reset QR codes
            setPaymentQRCodes(trip.rules?.payment?.qr_codes || {});
            prevManualRefreshId.current = manualRefreshId;
        } else {
            // Auto-refresh: Only update if form is clean
            if (!form.isDirty()) {
                const newValues = mapTripToValues(trip);
                form.setValues(newValues);
                form.setInitialValues(newValues);
                // No need to reset dirty, as it was already clean
                // Also reset coords if they assume sync with trip
                setOriginCoords(trip.origin ? { lat: trip.origin.lat, lng: trip.origin.lng } : null);
                setDestCoords(trip.destination ? { lat: trip.destination.lat, lng: trip.destination.lng } : null);
                // Also reset QR codes
                setPaymentQRCodes(trip.rules?.payment?.qr_codes || {});
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

    const fetchPlaceGeometry = async (placeId: string, setCoords: (c: { lat: number, lng: number }) => void) => {
        try {
            const apiKey = process.env.NEXT_PUBLIC_PLACES_AUTOCOMPLETE!;
            const response = await fetch(`https://places.googleapis.com/v1/places/${placeId}?fields=location&key=${apiKey}`);
            if (!response.ok) return;
            const data = await response.json();
            if (data.location) {
                setCoords({ lat: data.location.latitude, lng: data.location.longitude });
            }
        } catch (error) {
            console.error("Failed to fetch place details", error);
        }
    };

    const debounceFetch = (query: string, setSuggestions: (data: string[]) => void, setLoading: (l: boolean) => void, sessionToken: string) => {
        if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
        debounceTimeout.current = setTimeout(() => {
            fetchPlaces(query, setSuggestions, setLoading, sessionToken);
        }, 300);
    };

    // Helper to fetch Place ID from text query
    const fetchPlaceIdFromQuery = async (query: string, sessionToken: string): Promise<string | null> => {
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

            if (!response.ok) return null;
            const data = await response.json();
            if (data.suggestions && data.suggestions.length > 0) {
                return data.suggestions[0].placePrediction.placeId;
            }
        } catch (e) {
            console.error("Failed to fetch place ID for default option", e);
        }
        return null;
    };

    const handleStartChange = (val: string) => {
        form.setFieldValue('from_input_text', val);

        // Check if the typed/selected value matches a known prediction
        const knownId = predictionsMap.current.get(val);
        if (knownId) {
            setStartPlaceId(knownId);
            fetchPlaceGeometry(knownId, setOriginCoords);
        } else {
            setStartPlaceId(null);

            if (val === '') {
                setStartSuggestions(DEFAULT_AUTOCOMPLETE_LOCATIONS);
                if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
            } else {
                if (!startSessionToken.current) startSessionToken.current = crypto.randomUUID();
                debounceFetch(val, setStartSuggestions, setLoadingStart, startSessionToken.current);
            }
        }
    };

    const handleEndChange = (val: string) => {
        form.setFieldValue('to_input_text', val);

        const knownId = predictionsMap.current.get(val);
        if (knownId) {
            setEndPlaceId(knownId);
            fetchPlaceGeometry(knownId, setDestCoords);
        } else {
            setEndPlaceId(null);

            if (val === '') {
                setEndSuggestions(DEFAULT_AUTOCOMPLETE_LOCATIONS);
                if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
            } else {
                if (!endSessionToken.current) endSessionToken.current = crypto.randomUUID();
                debounceFetch(val, setEndSuggestions, setLoadingEnd, endSessionToken.current);
            }
        }
    };

    // Clear handlers
    const clearStart = () => {
        form.setFieldValue('from_input_text', '');
        setStartPlaceId(null);
        setStartSuggestions([]);
        setOriginCoords(null);
        startSessionToken.current = crypto.randomUUID();
    };

    const clearEnd = () => {
        form.setFieldValue('to_input_text', '');
        setEndPlaceId(null);
        setEndSuggestions([]);
        setDestCoords(null);
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

    // --- QR Code Helpers ---
    const handleQRCodeUpload = async (file: File | null, paymentMethod: string) => {
        if (!file) return;
        try {
            const compressedBase64 = await compressImage(file);
            setPaymentQRCodes(prev => ({ ...prev, [paymentMethod]: compressedBase64 }));
        } catch (error) {
            console.error('QR code compression failed:', error);
            notifications.show({
                title: t('rides.errors.qrUploadErrorTitle'),
                message: t('rides.errors.qrUploadError'),
                color: 'red'
            });
        }
    };

    const removeQRCode = (paymentMethod: string) => {
        setPaymentQRCodes(prev => {
            const updated = { ...prev };
            delete updated[paymentMethod];
            return updated;
        });
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
                // Try to find in map one last time
                const pid = predictionsMap.current.get(values.from_input_text);
                if (!pid) {
                    notifications.show({ title: t('tripDetails.edit.notifications.invalidStart.title'), message: t('tripDetails.edit.notifications.invalidStart.message'), color: 'red' });
                    return;
                }
            }
        }
        if (form.isDirty('to_input_text')) {
            if (!endPlaceId) {
                const pid = predictionsMap.current.get(values.to_input_text);
                if (!pid) {
                    notifications.show({ title: t('tripDetails.edit.notifications.invalidDest.title'), message: t('tripDetails.edit.notifications.invalidDest.message'), color: 'red' });
                    return;
                }
            }
        }

        // VALIDATION: Database NOT NULL checks
        if (!values.departure_time) {
            notifications.show({ title: t('tripDetails.edit.notifications.missingDeparture.title'), message: t('tripDetails.edit.notifications.missingDeparture.message'), color: 'red' });
            return;
        }

        if (values.departure_time < getChicagoNow()) {
            const originalTime = trip.departure_time ? fromChicagoISO(trip.departure_time).getTime() : 0;
            const newTime = values.departure_time.getTime();

            if (newTime !== originalTime) {
                notifications.show({ title: t('tripDetails.edit.notifications.invalidDeparture.title'), message: t('tripDetails.edit.notifications.invalidDeparture.message'), color: 'red' });
                return;
            }
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
            if (values.departure_time) {
                payload.departure_time = toChicagoISO(values.departure_time);
            }

            // Attach Place IDs and Session Tokens if changed/available
            if (startPlaceId) {
                payload.from_place_id = startPlaceId;
                payload.from_session_token = startSessionToken.current;
            } else if (form.isDirty('from_input_text')) {
                // Should have been caught by validation, but safeguard
                const pid = predictionsMap.current.get(values.from_input_text);
                if (pid) {
                    payload.from_place_id = pid;
                    payload.from_session_token = startSessionToken.current;
                }
            }

            if (endPlaceId) {
                payload.to_place_id = endPlaceId;
                payload.to_session_token = endSessionToken.current;
            } else if (form.isDirty('to_input_text')) {
                const pid = predictionsMap.current.get(values.to_input_text);
                if (pid) {
                    payload.to_place_id = pid;
                    payload.to_session_token = endSessionToken.current;
                }
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

            if ((values.paymentHandle as any) !== '' && values.paymentHandle !== null) {
                payload.paymentHandle = values.paymentHandle;
            } else {
                payload.paymentHandle = null;
            }

            if ((values.flexibility as any) !== '' && values.flexibility !== null) {
                payload.flexibility = `${values.flexibility} hours`;
            } else {
                payload.flexibility = '15 minutes';
            }

            if (payload.car === 'none') {
                delete payload.car;
            }

            // Add payment QR codes - filter to only include currently selected payment methods
            const paymentMethods = values.paymentMethods || [];
            const filteredQRCodes: Record<string, string> = {};
            for (const method of paymentMethods) {
                if (paymentQRCodes[method]) {
                    filteredQRCodes[method] = paymentQRCodes[method];
                }
            }
            payload.paymentQRCodes = filteredQRCodes;

            const token = await user.getIdToken();
            console.log(payload);
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
                                onFocus={() => {
                                    if (!form.values.from_input_text) setStartSuggestions(DEFAULT_AUTOCOMPLETE_LOCATIONS);
                                }}
                                onOptionSubmit={async (val) => {
                                    form.setFieldValue('from_input_text', val);
                                    let pid = predictionsMap.current.get(val) || null;
                                    if (!pid && DEFAULT_AUTOCOMPLETE_LOCATIONS.includes(val)) {
                                        if (!startSessionToken.current) startSessionToken.current = crypto.randomUUID();
                                        pid = await fetchPlaceIdFromQuery(val, startSessionToken.current);
                                    }

                                    if (pid) {
                                        setStartPlaceId(pid);
                                        fetchPlaceGeometry(pid, setOriginCoords);
                                    }
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
                                onFocus={() => {
                                    if (!form.values.to_input_text) setEndSuggestions(DEFAULT_AUTOCOMPLETE_LOCATIONS);
                                }}
                                onOptionSubmit={async (val) => {
                                    form.setFieldValue('to_input_text', val);
                                    let pid = predictionsMap.current.get(val) || null;
                                    if (!pid && DEFAULT_AUTOCOMPLETE_LOCATIONS.includes(val)) {
                                        if (!endSessionToken.current) endSessionToken.current = crypto.randomUUID();
                                        pid = await fetchPlaceIdFromQuery(val, endSessionToken.current);
                                    }

                                    if (pid) {
                                        setEndPlaceId(pid);
                                        fetchPlaceGeometry(pid, setDestCoords);
                                    }
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
                                {originCoords && (
                                    <RadiusMap
                                        lat={originCoords.lat}
                                        lng={originCoords.lng}
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
                                {destCoords && (
                                    <RadiusMap
                                        lat={destCoords.lat}
                                        lng={destCoords.lng}
                                        radiusMeters={form.values.dropoffRadius || 0}
                                        type="dropoff"
                                    />
                                )}
                            </Stack>
                        </SimpleGrid>

                        <Input.Wrapper label={t('tripDetails.edit.labels.departureTime')}>
                            <Input
                                component="input"
                                type="datetime-local"
                                placeholder={t('tripDetails.edit.placeholders.pickDate')}
                                value={toDateTimeLocalString(form.values.departure_time)}
                                onChange={(e) => {
                                    const val = e.currentTarget.value;
                                    form.setFieldValue('departure_time', val ? fromDateTimeLocalString(val) : null);
                                }}
                                leftSection={<IconCalendar size={16} />}
                                rightSection={renderRightSection(false, form.values.departure_time ? 'true' : '', () => form.setFieldValue('departure_time', null))}
                                rightSectionPointerEvents="all"
                                min={toDateTimeLocalString(getChicagoNow())}
                            />
                        </Input.Wrapper>

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
                                ...cars.map(c => ({ value: c.id, label: `${c.year || ''} ${c.make || ''} ${c.model || ''}` }))
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

                        {/* Payment QR Codes */}
                        {form.values.paymentMethods && form.values.paymentMethods.length > 0 && (
                            <Stack gap="xs">
                                <Text size="sm" fw={500}>
                                    {t('rides.create.labels.paymentQRCodes')}
                                </Text>
                                <Text size="xs" c="dimmed">
                                    {t('rides.create.labels.paymentQRCodesDesc')}
                                </Text>
                                <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
                                    {(form.values.paymentMethods as string[]).map((method: string) => (
                                        <Paper key={method} p="sm" withBorder radius="md">
                                            <Stack gap="xs">
                                                <Group justify="space-between">
                                                    <Text size="sm" fw={500}>{method}</Text>
                                                    {paymentQRCodes[method] && (
                                                        <ActionIcon
                                                            variant="subtle"
                                                            color="red"
                                                            size="sm"
                                                            onClick={() => removeQRCode(method)}
                                                            title={t('rides.create.labels.removeQRCode') as string}
                                                        >
                                                            <IconTrash size={14} />
                                                        </ActionIcon>
                                                    )}
                                                </Group>
                                                {paymentQRCodes[method] ? (
                                                    <Image
                                                        src={paymentQRCodes[method]}
                                                        alt={`${method} QR Code`}
                                                        h={120}
                                                        w="auto"
                                                        fit="contain"
                                                        radius="sm"
                                                    />
                                                ) : (
                                                    <FileButton
                                                        onChange={(file) => handleQRCodeUpload(file, method)}
                                                        accept="image/*"
                                                    >
                                                        {(props) => (
                                                            <Button
                                                                {...props}
                                                                variant="light"
                                                                leftSection={<IconUpload size={14} />}
                                                                size="xs"
                                                            >
                                                                {t('rides.create.labels.uploadQRCode')}
                                                            </Button>
                                                        )}
                                                    </FileButton>
                                                )}
                                            </Stack>
                                        </Paper>
                                    ))}
                                </SimpleGrid>
                            </Stack>
                        )}

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

                        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                            <NumberInput
                                label={t('tripDetails.edit.labels.paidBigLuggageLimit')}
                                min={0}
                                {...form.getInputProps('bigLuggagePaid')}
                            />
                            <NumberInput
                                label={t('tripDetails.edit.labels.paidSmallLuggageLimit')}
                                min={0}
                                {...form.getInputProps('smallLuggagePaid')}
                            />
                        </SimpleGrid>

                        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                            <NumberInput
                                label={t('tripDetails.edit.labels.paidBigLuggagePrice')}
                                min={0}
                                {...form.getInputProps('bigLuggagePaidPrice')}
                                disabled={!form.values.bigLuggagePaid || form.values.bigLuggagePaid === 0}
                            />
                            <NumberInput
                                label={t('tripDetails.edit.labels.paidSmallLuggagePrice')}
                                min={0}
                                {...form.getInputProps('smallLuggagePaidPrice')}
                                disabled={!form.values.smallLuggagePaid || form.values.smallLuggagePaid === 0}
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
