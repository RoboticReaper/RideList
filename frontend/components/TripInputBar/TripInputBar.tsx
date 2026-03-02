'use client';

import dayjs, { toChicagoISO, getChicagoNow } from '@/utils/dateUtils';

import { useState, useRef, useEffect } from 'react';
import {
    ActionIcon, Autocomplete, Badge, Box, Button, Card, Checkbox, Collapse, Divider, FileButton, Grid, Group, Image, Input, Loader as MantineLoader, Modal, NumberInput, Paper, Radio, Select, SimpleGrid, Stack, Stepper, Switch, TagsInput, Text, TextInput, Textarea, Title, Accordion, Anchor
} from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useParams } from 'next/navigation';
import { toDateTimeLocalString, fromDateTimeLocalString } from '@/utils/dateUtils';
import { IconMapPin, IconCalendar, IconX, IconCar, IconCheck, IconUpload, IconTrash, IconQrcode, IconPhoto } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useNotifications } from '../Notifications/NotificationContext';
import { useRouter } from 'next/navigation';
import { useAuth } from '../firebase/AuthContext';
import { getLocalizedHref } from '../LocalizedLink';
import { parseFlexibility, parsePayWindow, parseCutoffTimeNullable, parseStartCheckInNullable } from '@/utils/intervalParsers';
import { RadiusMap } from '../Rides/RadiusMap';
import { DEFAULT_AUTOCOMPLETE_LOCATIONS } from '@/utils/defaultLocations';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { compressImage } from '@/utils/compressImage';

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

interface TripInputBarProps {
    initialFrom?: string;
    initialTo?: string;
    initialFromCoords?: { lat: number; lng: number };
    initialToCoords?: { lat: number; lng: number };
    initialDateTime?: Date;
    initialFlexibility?: number;
}

export function TripInputBar({ initialFrom, initialTo, initialFromCoords, initialToCoords, initialDateTime, initialFlexibility }: TripInputBarProps = {}) {
    const { t } = useTranslation('common');
    const { user, handleProtectedAction } = useAuth();
    const { showPrompt, pushPermission } = useNotifications();
    const router = useRouter();
    const params = useParams();
    const { isIOS, isStandalone } = usePWAInstall();
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
    const [carPics, setCarPics] = useState<(string | null)[]>([null, null, null, null]);

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
            notifications.show({ title: t('rides.errors.errorTitle'), message: t('rides.errors.postingTrip'), color: 'red' });
        }
    };

    const removeCarPic = (index: number) => {
        setCarPics(prev => {
            const next = [...prev];
            next[index] = null;
            return next;
        });
    };

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
    const [paymentQRCodes, setPaymentQRCodes] = useState<Record<string, string>>({});
    const [bigLuggage, setBigLuggage] = useState<number | ''>(0);
    const [smallLuggage, setSmallLuggage] = useState<number | ''>(0);
    const [bigLuggagePaid, setBigLuggagePaid] = useState<number | ''>(0);
    const [smallLuggagePaid, setSmallLuggagePaid] = useState<number | ''>(0);
    const [bigLuggagePaidPrice, setBigLuggagePaidPrice] = useState<number | ''>(0);
    const [smallLuggagePaidPrice, setSmallLuggagePaidPrice] = useState<number | ''>(0);

    // --- Step 5: Rules State ---
    const [autoAccept, setAutoAccept] = useState(true);
    const [flexibility, setFlexibility] = useState<number | ''>(0.25);
    const [pickupRadius, setPickupRadius] = useState<number | ''>(10000);
    const [dropoffRadius, setDropoffRadius] = useState<number | ''>(10000);
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
            const badgeText = info.type === 'Trip'
                ? t('rides.create.sourceBadge.tripTemplate', { name: info.name })
                : t('rides.create.sourceBadge.ruleTemplate', { name: info.name });
            return <Badge size="xs" variant="light" color={info.type === 'Trip' ? 'blue' : 'green'}>{badgeText}</Badge>;
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
        paymentQRCodes?: Record<string, string>;
        paymentHandle: string;
        bigLuggage: number | '';
        smallLuggage: number | '';
        bigLuggagePaid: number | '';
        smallLuggagePaid: number | '';
        bigLuggagePaidPrice: number | '';
        smallLuggagePaidPrice: number | '';
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
        startCoords: { lat: number; lng: number } | null;
        endCoords: { lat: number; lng: number } | null;
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
                if (draft.startTime) setStartTime(dayjs(draft.startTime).toDate());
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
                if (draft.paymentQRCodes) setPaymentQRCodes(draft.paymentQRCodes);
                if (draft.paymentHandle) setPaymentHandle(draft.paymentHandle);
                if (draft.bigLuggage !== undefined) setBigLuggage(draft.bigLuggage);
                if (draft.smallLuggage !== undefined) setSmallLuggage(draft.smallLuggage);
                if (draft.bigLuggagePaid !== undefined) setBigLuggagePaid(draft.bigLuggagePaid);
                if (draft.smallLuggagePaid !== undefined) setSmallLuggagePaid(draft.smallLuggagePaid);
                if (draft.bigLuggagePaidPrice !== undefined) setBigLuggagePaidPrice(draft.bigLuggagePaidPrice);
                if (draft.smallLuggagePaidPrice !== undefined) setSmallLuggagePaidPrice(draft.smallLuggagePaidPrice);

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
                if (draft.startCoords) setStartCoords(draft.startCoords);
                if (draft.endCoords) setEndCoords(draft.endCoords);

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
                    (draft.paymentQRCodes && Object.keys(draft.paymentQRCodes).length > 0) ||
                    (!!draft.paymentHandle) ||
                    (draft.bigLuggage !== 0 && draft.bigLuggage !== '' && draft.bigLuggage !== undefined) ||
                    (draft.smallLuggage !== 0 && draft.smallLuggage !== '' && draft.smallLuggage !== undefined) ||
                    (draft.autoAccept === false) || // Default is true
                    (draft.flexibility !== 0.25 && !!draft.flexibility) ||
                    (draft.pickupRadius !== 10000 && draft.pickupRadius !== '' && draft.pickupRadius !== undefined) ||
                    (draft.dropoffRadius !== 10000 && draft.dropoffRadius !== '' && draft.dropoffRadius !== undefined) ||
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
                        title: t('rides.create.restoredDraftTitle'),
                        message: t('rides.create.restoredDraftMessage'),
                        color: 'blue',
                        autoClose: 3000
                    });
                }
            }
        } catch (e) {
            console.error("Failed to load draft", e);
        }
    }, []);

    // --- Apply Initial Values from Props (e.g., from trends autofill) ---
    useEffect(() => {
        if (initialFrom) {
            setStartLocation(initialFrom);
            setIsStartSelected(true);
            startLastSelection.current = initialFrom;

            // Use provided coordinates directly if available
            if (initialFromCoords) {
                setStartCoords(initialFromCoords);
            } else {
                // Fallback: fetch place ID for the initial value
                if (!startSessionToken.current) startSessionToken.current = crypto.randomUUID();
                fetchPlaceIdFromQuery(initialFrom, startSessionToken.current).then(pid => {
                    if (pid) {
                        setStartPlaceId(pid);
                        fetchPlaceDetails(pid, setStartCoords, startSessionToken.current);
                    }
                });
            }
        }
    }, [initialFrom, initialFromCoords]);

    useEffect(() => {
        if (initialTo) {
            setEndLocation(initialTo);
            setIsEndSelected(true);
            endLastSelection.current = initialTo;

            // Use provided coordinates directly if available
            if (initialToCoords) {
                setEndCoords(initialToCoords);
            } else {
                // Fallback: fetch place ID for the initial value
                if (!endSessionToken.current) endSessionToken.current = crypto.randomUUID();
                fetchPlaceIdFromQuery(initialTo, endSessionToken.current).then(pid => {
                    if (pid) {
                        setEndPlaceId(pid);
                        fetchPlaceDetails(pid, setEndCoords, endSessionToken.current);
                    }
                });
            }
        }
    }, [initialTo, initialToCoords]);

    // Apply initial date/time and flexibility
    useEffect(() => {
        if (initialDateTime) {
            setStartTime(initialDateTime);
        }
        if (initialFlexibility !== undefined) {
            setFlexibility(initialFlexibility);
        }
    }, [initialDateTime, initialFlexibility]);

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
        setCarPics([null, null, null, null]);
        setPaymentMethods([]);
        setPaymentQRCodes({});
        setPaymentHandle('');
        setBigLuggage(0);
        setSmallLuggage(0);
        setBigLuggagePaid(0);
        setSmallLuggagePaid(0);
        setBigLuggagePaidPrice(0);
        setSmallLuggagePaidPrice(0);
        setAutoAccept(true);
        setFlexibility(0.25);
        setPickupRadius(10000);
        setDropoffRadius(10000);
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
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [active, postedLink]);

    // Handle Redirect Trigger
    useEffect(() => {
        if (active === 5 && postedLink && redirectCountdown === 0) {
            router.push(postedLink);
        }
    }, [active, postedLink, redirectCountdown, router]);

    // Save Draft Effect (Debounced)
    useEffect(() => {
        // DO NOT SAVE if we are on the completion step (active === 5)
        if (active === 5) return;

        const timeout = setTimeout(() => {
            let encodedStartTime = null;
            if (startTime) {
                if (startTime instanceof Date) {
                    // Store as Chicago Wall Clock String for portability
                    encodedStartTime = dayjs(startTime).format('YYYY-MM-DDTHH:mm:ss');
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
                paymentQRCodes,
                paymentHandle,
                bigLuggage,
                smallLuggage,
                bigLuggagePaid,
                smallLuggagePaid,
                bigLuggagePaidPrice,
                smallLuggagePaidPrice,
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
                startCheckInHrs,
                startCoords,
                endCoords
            };
            localStorage.setItem('trip_draft', JSON.stringify(draft));
        }, 1000); // Save after 1 second of inactivity

        return () => clearTimeout(timeout);
    }, [
        active, startLocation, endLocation, startTime, price, seats,
        selectedCarId, carMake, carModel, carColor, carYear, carPlate,
        carBigLuggage, carSmallLuggage, carSeats, paymentMethods, paymentHandle,
        bigLuggage, smallLuggage, bigLuggagePaid, smallLuggagePaid, bigLuggagePaidPrice, smallLuggagePaidPrice, autoAccept, flexibility, pickupRadius,
        dropoffRadius, pickupRules, cancellationPolicy, cutoffEnabled,
        dropoffRadius, pickupRules, cancellationPolicy, cutoffEnabled,
        cutoffHours, payWindow, notes, startPlaceId, endPlaceId, startCheckInHrs,
        startCoords, endCoords
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


    const fetchPlaceDetails = async (placeId: string, setCoords: (c: { lat: number, lng: number } | null) => void, sessionToken: string) => {
        try {
            const apiKey = process.env.NEXT_PUBLIC_PLACES_AUTOCOMPLETE!;
            const response = await fetch(`https://places.googleapis.com/v1/places/${placeId}?fields=location&key=${apiKey}&sessionToken=${sessionToken}`);
            const data = await response.json();
            if (data.location) {
                setCoords({ lat: data.location.latitude, lng: data.location.longitude });
            }
        } catch (error) {
            console.error("Failed to fetch place details", error);
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

        if (val === '') {
            setStartSuggestions(DEFAULT_AUTOCOMPLETE_LOCATIONS);
            if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
        } else {
            if (!startSessionToken.current) startSessionToken.current = crypto.randomUUID();
            debounceFetch(val, setStartSuggestions, setLoadingStart, startSessionToken.current);
        }
    };

    const handleEndChange = (val: string) => {
        setEndLocation(val);
        if (val !== endLastSelection.current) {
            setIsEndSelected(false);
            endLastSelection.current = '';
            setEndPlaceId(null);
        }

        if (val === '') {
            setEndSuggestions(DEFAULT_AUTOCOMPLETE_LOCATIONS);
            if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
        } else {
            if (!endSessionToken.current) endSessionToken.current = crypto.randomUUID();
            debounceFetch(val, setEndSuggestions, setLoadingEnd, endSessionToken.current);
        }
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

    // --- QR Code Upload Helpers ---
    const handleQRCodeUpload = async (file: File | null, paymentMethod: string) => {
        if (!file) {
            // Remove QR code for this payment method
            setPaymentQRCodes(prev => {
                const next = { ...prev };
                delete next[paymentMethod];
                return next;
            });
            return;
        }

        // Convert File to base64
        const reader = new FileReader();
        reader.onload = () => {
            const base64 = reader.result as string;
            setPaymentQRCodes(prev => ({
                ...prev,
                [paymentMethod]: base64
            }));
        };
        reader.onerror = () => {
            notifications.show({
                title: t('rides.errors.qrUploadErrorTitle'),
                message: t('rides.errors.qrUploadError'),
                color: 'red'
            });
        };
        reader.readAsDataURL(file);
    };

    const removeQRCode = (paymentMethod: string) => {
        setPaymentQRCodes(prev => {
            const next = { ...prev };
            delete next[paymentMethod];
            return next;
        });
    };

    // --- Navigation Logic ---
    const nextStep = () => {
        // Step 1 Validation
        if (active === 0) {
            if (!isStartSelected || (!startPlaceId && !startCoords)) {
                notifications.show({ title: t('rides.errors.invalidStartTitle'), message: t('rides.errors.invalidStart'), color: 'red' });
                return;
            }
            if (!isEndSelected || (!endPlaceId && !endCoords)) {
                notifications.show({ title: t('rides.errors.invalidEndTitle'), message: t('rides.errors.invalidEnd'), color: 'red' });
                return;
            }
            if (!startTime) {
                notifications.show({ title: t('rides.errors.dateRequiredTitle'), message: t('rides.errors.dateRequired'), color: 'red' });
                return;
            }
            if (startTime < getChicagoNow()) {
                notifications.show({ title: t('rides.errors.pastDateTitle'), message: t('rides.errors.pastDate'), color: 'red' });
                return;
            }
        }

        // Step 2 Validation (Details)
        if (active === 1) {
            if (price === '' || price < 0) {
                notifications.show({ title: t('rides.errors.priceRequiredTitle'), message: t('rides.errors.priceRequired'), color: 'red' });
                return;
            }
            if (seats === '' || seats < 1) {
                notifications.show({ title: t('rides.errors.seatsRequiredTitle'), message: t('rides.errors.seatsRequired'), color: 'red' });
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
                        notifications.show({ title: t('rides.errors.carSeatsRequiredTitle'), message: t('rides.errors.carSeatsRequired'), color: 'red' });
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
                    title: t('rides.errors.capacityExceededTitle'),
                    message: t('rides.errors.capacityExceeded', { capacity: carCapacity, seats }),
                    color: 'red'
                });
                return;
            }
        }

        // Step 4 Validation (Logistics)
        if (active === 3) {
            // Payment Methods are now OPTIONAL
            /* if (paymentMethods.length === 0) {
                notifications.show({ title: t('rides.errors.paymentMethodRequiredTitle'), message: t('rides.errors.paymentMethodRequired'), color: 'red' });
                return;
            } */
            // Payment Handle is now OPTIONAL unless Payment Methods are selected
            if (paymentMethods.length > 0 && !paymentHandle.trim()) {
                notifications.show({ title: t('rides.errors.paymentHandleRequiredTitle'), message: t('rides.errors.paymentHandleRequired'), color: 'red' });
                return;
            }

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
                        title: t('rides.errors.luggageCheck'),
                        message: t('rides.errors.bigLuggageExceeded', { limit: bigLuggage || 0, capacity: carBigCap }),
                        color: 'red',
                        autoClose: false
                    });
                }
                if (carSmallCap !== null && Number(smallLuggage || 0) > carSmallCap) {
                    notifications.show({
                        title: t('rides.errors.luggageCheck'),
                        message: t('rides.errors.smallLuggageExceeded', { limit: smallLuggage || 0, capacity: carSmallCap }),
                        color: 'red',
                        autoClose: false
                    });
                }
            }

            // Required Field Validation
            if (bigLuggage === '') {
                notifications.show({ title: t('rides.errors.bigLuggageRequiredTitle'), message: t('rides.errors.bigLuggageRequired'), color: 'red' });
                return;
            }
            if (smallLuggage === '') {
                notifications.show({ title: t('rides.errors.smallLuggageRequiredTitle'), message: t('rides.errors.smallLuggageRequired'), color: 'red' });
                return;
            }
        }

        setActive((current) => (current < 5 ? current + 1 : active));
    };

    const prevStep = () => setActive((current) => (current > 0 ? current - 1 : current));

    const handleFinalSubmit = async () => {
        // Validation: Template Name if Saving (Rule or Trip)
        if (saveTemplate && !ruleTemplateName.trim()) {
            notifications.show({ title: t('rides.errors.templateNameRequiredTitle'), message: t('rides.errors.ruleTemplateNameRequired'), color: 'red' });
            return;
        }
        if (saveTripTemplate && !tripTemplateName.trim()) {
            notifications.show({ title: t('rides.errors.templateNameRequiredTitle'), message: t('rides.errors.templateNameRequired'), color: 'red' });
            return;
        }

        // Validation for Advanced Settings (Step 5)
        if (flexibility === '') {
            notifications.show({ title: t('rides.errors.flexibilityRequiredTitle'), message: t('rides.errors.flexibilityRequired'), color: 'red' });
            return;
        }
        if (pickupRadius === '' || pickupRadius < 500) {
            notifications.show({ title: t('rides.errors.pickupRadiusRequiredTitle'), message: t('rides.errors.pickupRadiusRequired'), color: 'red' });
            return;
        }
        if (dropoffRadius === '' || dropoffRadius < 500) {
            notifications.show({ title: t('rides.errors.dropoffRadiusRequiredTitle'), message: t('rides.errors.dropoffRadiusRequired'), color: 'red' });
            return;
        }
        if (payWindow === '' || payWindow < 1) {
            notifications.show({ title: t('rides.errors.payWindowRequiredTitle'), message: t('rides.errors.payWindowRequired'), color: 'red' });
            return;
        }
        if (cutoffEnabled && (cutoffHours === '' || cutoffHours === null || cutoffHours < 0)) {
            notifications.show({ title: t('rides.errors.invalidCutoffTimeTitle'), message: t('rides.errors.invalidCutoffTime'), color: 'red' });
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
            departureTime: startTime ? toChicagoISO(startTime) : null,
            price: Number(price),
            seats: Number(seats),
            paymentMethods,
            paymentHandle,
            bigLuggage: Number(bigLuggage),
            smallLuggage: Number(smallLuggage),
            bigLuggagePaid: Number(bigLuggagePaid),
            smallLuggagePaid: Number(smallLuggagePaid),
            bigLuggagePaidPrice: Number(bigLuggagePaidPrice),
            smallLuggagePaidPrice: Number(smallLuggagePaidPrice),
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
            // Only include QR codes for payment methods that have an uploaded image
            paymentQRCodes: Object.keys(paymentQRCodes).length > 0
                ? Object.fromEntries(
                    paymentMethods
                        .filter(m => paymentQRCodes[m])
                        .map(m => [m, paymentQRCodes[m]])
                )
                : {},
        };

        // Attach Car Info
        if (selectedCarId === 'new') {
            const isAnyFieldFilled = carMake.trim() || carModel.trim() || carColor.trim() || carYear.trim() || carPlate.trim() || carBigLuggage !== '' || carSmallLuggage !== '' || carSeats !== '';

            if (isAnyFieldFilled) {
                const token = await user.getIdToken();
                // 1. Upload any new base64 images individually first
                const uploadedUrls = [...carPics];
                for (let i = 0; i < uploadedUrls.length; i++) {
                    const picData = uploadedUrls[i];
                    if (picData && typeof picData === 'string' && picData.startsWith('data:')) {
                        const uploadRes = await fetch('/api/user/cars/upload-image', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                            },
                            body: JSON.stringify({ image: picData })
                        });

                        if (!uploadRes.ok) {
                            throw new Error('Failed to upload car image ' + (i + 1));
                        }

                        const uploadData = await uploadRes.json();
                        uploadedUrls[i] = uploadData.url;
                    }
                }

                payload.car = {
                    make: carMake,
                    model: carModel,
                    color: carColor,
                    year: carYear,
                    plate: carPlate,
                    big_luggage: carBigLuggage !== '' ? carBigLuggage : null,
                    small_luggage: carSmallLuggage !== '' ? carSmallLuggage : null,
                    seats: carSeats !== '' ? Number(carSeats) : null,
                    pic1: uploadedUrls[0],
                    pic2: uploadedUrls[1],
                    pic3: uploadedUrls[2],
                    pic4: uploadedUrls[3],
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
            title: t('rides.errors.postingTripTitle'),
            message: t('rides.errors.postingTrip'),
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
                title: t('rides.errors.successTitle'),
                message: t('rides.errors.success'),
                icon: <IconCheck size={16} />,
                loading: false,
                autoClose: 2000,
            });

            setPostedLink(getLocalizedHref(params, `/rides/${data.tripId}`));

            // Trigger push permission prompt (might be nice to ask driver too)
            showPrompt();

            nextStep();

        } catch (error: any) {
            notifications.update({
                id,
                color: 'red',
                title: t('rides.errors.errorTitle'),
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
                <Stepper.Step label={t('rides.create.steps.route')} description={t('rides.create.steps.routeDesc')}>
                    <Stack gap="md" mt="lg">
                        {tripTemplates.length > 0 && (
                            <Select
                                label={t('rides.create.labels.loadTemplate')}
                                placeholder={t('rides.create.placeholders.selectTemplate')}
                                data={tripTemplates.map(tmpl => ({ value: tmpl.id, label: tmpl.name || t('rides.create.defaults.untitledTrip') }))}
                                value={selectedTripTemplate}
                                onChange={(val) => {
                                    setSelectedTripTemplate(val);
                                    if (val) {
                                        const tmpl = tripTemplates.find(x => x.id === val);
                                        if (tmpl) {
                                            const tName = tmpl.name || t('rides.create.defaults.tripTemplate');
                                            // Prefill Logic

                                            if (tmpl.from_text && tmpl.from_text !== '') {
                                                setStartLocation(tmpl.from_text);
                                                setStartCoords({ lat: tmpl.origin_lat, lng: tmpl.origin_lng });
                                                setIsStartSelected(true);
                                                setStartPlaceId(tmpl.from_place_id);
                                            }

                                            if (tmpl.to_text && tmpl.to_text !== '') {
                                                setEndLocation(tmpl.to_text);
                                                setEndCoords({ lat: tmpl.dest_lat, lng: tmpl.dest_lng });
                                                setIsEndSelected(true);
                                                setEndPlaceId(tmpl.to_place_id);
                                            }

                                            setPrice(Number(tmpl.price));
                                            setSeats(Number(tmpl.total_seats));
                                            setNotes(tmpl.notes);

                                            setLoadingStart(false);
                                            setLoadingEnd(false);

                                            if (tmpl.car) setSelectedCarId(tmpl.car);

                                            // Rule Prefill if exists
                                            if (tmpl.rule_details) {
                                                const r = tmpl.rule_details;
                                                setBigLuggage(r.big_luggage_lim ?? '');
                                                setSmallLuggage(r.small_luggage_lim ?? '');
                                                setBigLuggagePaid(r.big_luggage_paid ?? 0);
                                                setSmallLuggagePaid(r.small_luggage_paid ?? 0);
                                                setBigLuggagePaidPrice(r.big_luggage_paid_price ?? 0);
                                                setSmallLuggagePaidPrice(r.small_luggage_paid_price ?? 0);
                                                setPaymentMethods(r.payment_methods || []);
                                                setPaymentQRCodes(r.payment_qr_codes || {});
                                                setPaymentHandle(r.payment_handle || '');
                                                setAutoAccept(r.auto_accept);
                                                setFlexibility(r.departure_time_flexibility ? parseFlexibility(r.departure_time_flexibility) : 0.25);
                                                setPickupRadius(r.pickup_radius_meters || 10000);
                                                setDropoffRadius(r.drop_off_radius_meters || 10000);
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

                        <Title order={4}>{t('rides.create.labels.tripRoute')}</Title>
                        <Autocomplete
                            label={<Group gap="xs">{t('rides.create.labels.from')} {renderSourceBadge('startLocation')}</Group>}
                            description={t('rides.create.labels.locationPrivacyDesc')}
                            placeholder={t('rides.create.labels.startingLoc')}
                            leftSection={<IconMapPin size={16} />}
                            data={startSuggestions}
                            value={startLocation}
                            required
                            onChange={(val) => {
                                handleStartChange(val);
                                setFieldSourceManual(['startLocation']);
                            }}
                            onFocus={() => {
                                if (!startLocation) setStartSuggestions(DEFAULT_AUTOCOMPLETE_LOCATIONS);
                            }}
                            onOptionSubmit={async (val) => {
                                // Auto-Select
                                setLoadingStart(true);
                                try {
                                    setIsStartSelected(true);
                                    startLastSelection.current = val;

                                    let pid = predictionsMap.current.get(val) || null;
                                    if (!pid && DEFAULT_AUTOCOMPLETE_LOCATIONS.includes(val)) {
                                        if (!startSessionToken.current) startSessionToken.current = crypto.randomUUID();
                                        pid = await fetchPlaceIdFromQuery(val, startSessionToken.current);
                                    }

                                    setStartPlaceId(pid);
                                    if (pid) {
                                        if (!startSessionToken.current) startSessionToken.current = crypto.randomUUID();
                                        await fetchPlaceDetails(pid, setStartCoords, startSessionToken.current);
                                    }

                                    // Auto-Check Trip Templates if applicable - Logic remains same
                                    // ...
                                } finally {
                                    setLoadingStart(false);
                                }
                            }}
                            rightSection={renderRightSection(loadingStart, startLocation, clearStart)}
                        />

                        <Autocomplete
                            label={<Group gap="xs">{t('rides.create.labels.to')} {renderSourceBadge('endLocation')}</Group>}
                            description={t('rides.create.labels.locationPrivacyDesc')}
                            placeholder={t('rides.create.labels.dest')}
                            leftSection={<IconMapPin size={16} />}
                            data={endSuggestions}
                            value={endLocation}
                            required
                            onFocus={() => {
                                if (!endLocation) setEndSuggestions(DEFAULT_AUTOCOMPLETE_LOCATIONS);
                            }}
                            onChange={(val) => {
                                handleEndChange(val);
                                setFieldSourceManual(['endLocation']);
                            }}
                            onOptionSubmit={async (val) => {
                                // Auto-Select
                                setLoadingEnd(true);
                                try {
                                    setIsEndSelected(true);
                                    endLastSelection.current = val;

                                    let pid = predictionsMap.current.get(val) || null;
                                    if (!pid && DEFAULT_AUTOCOMPLETE_LOCATIONS.includes(val)) {
                                        if (!endSessionToken.current) endSessionToken.current = crypto.randomUUID();
                                        pid = await fetchPlaceIdFromQuery(val, endSessionToken.current);
                                    }

                                    setEndPlaceId(pid);
                                    if (pid) {
                                        if (!endSessionToken.current) endSessionToken.current = crypto.randomUUID();
                                        await fetchPlaceDetails(pid, setEndCoords, endSessionToken.current);
                                    }

                                    // Auto-Check Trip Templates if applicable - Logic remains same
                                    // ...
                                } finally {
                                    setLoadingEnd(false);
                                }
                            }}
                            rightSection={renderRightSection(loadingEnd, endLocation, clearEnd)}
                        />

                        <Input.Wrapper label={t('rides.create.labels.departure')} required>
                            <Input
                                component="input"
                                type="datetime-local"
                                placeholder={t('rides.create.labels.pickDateTime')}
                                value={toDateTimeLocalString(startTime)}
                                required
                                onChange={(e) => {
                                    const val = e.currentTarget.value;
                                    setStartTime(val ? fromDateTimeLocalString(val) : null);
                                }}
                                leftSection={<IconCalendar size={16} />}
                                rightSection={renderRightSection(false, startTime ? 'true' : '', () => setStartTime(null))}
                                rightSectionPointerEvents="all"
                                min={toDateTimeLocalString(getChicagoNow())}
                            />
                        </Input.Wrapper>

                        <NumberInput
                            label={<Group gap="xs">{t('rides.create.labels.flexibility')} {renderSourceBadge('flexibility')}</Group>}
                            description={t('rides.create.labels.flexibilityDesc')}
                            required
                            value={flexibility}
                            onChange={(val) => {
                                setFlexibility(val === '' ? '' : Number(val));
                                setFieldSourceManual(['flexibility']);
                            }}
                            min={0}
                            step={0.25}
                        />

                        <Group justify="flex-end" mt="md">
                            <Button onClick={nextStep}>{t('rides.create.labels.nextDetails')}</Button>
                        </Group>
                    </Stack>
                </Stepper.Step>

                {/* STEP 2: Core Details */}
                <Stepper.Step label={t('rides.create.steps.details')} description={t('rides.create.steps.detailsDesc')}>
                    <Stack gap="md" mt="lg">
                        <Title order={4}>{t('rides.create.labels.tripDetails')}</Title>
                        <NumberInput
                            label={<Group gap="xs">{t('rides.create.labels.pricePerPerson')} {renderSourceBadge('price')}</Group>}
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
                            label={<Group gap="xs">{t('rides.create.labels.totalSeats')} {renderSourceBadge('seats')}</Group>}
                            description={t('rides.create.labels.capacityDesc')}
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
                            <Button variant="default" onClick={prevStep}>{t('rides.create.labels.back')}</Button>
                            <Button onClick={nextStep}>{t('rides.create.labels.nextVehicle')}</Button>
                        </Group>
                    </Stack>
                </Stepper.Step>

                {/* STEP 3: Vehicle Info (Dynamic Selection) */}
                <Stepper.Step label={t('rides.create.steps.vehicle')} description={t('rides.create.steps.vehicleDesc')}>
                    <Stack gap="md" mt="lg">
                        <Title order={4}>{t('rides.create.labels.vehicleDetails')}</Title>

                        {/* Saved Cars Selection */}
                        {loadingCars ? <MantineLoader size="sm" /> : (
                            <Radio.Group
                                value={selectedCarId}
                                onChange={(val) => {
                                    setSelectedCarId(val);
                                    setFieldSourceManual(['selectedCarId']);
                                }}
                                label={<Group gap="xs">{t('rides.create.labels.selectSavedVehicle')} {renderSourceBadge('selectedCarId')}</Group>}
                                description={t('rides.create.labels.addVehicleDesc')}
                            >
                                <Stack mt="xs">
                                    <Paper withBorder p="sm" radius="md">
                                        <Radio
                                            value="none"
                                            label={<Text fw={500}>{t('rides.create.labels.noVehicle')}</Text>}
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
                                            label={<Text fw={500}>{t('rides.create.labels.addNewVehicle')}</Text>}
                                        />
                                    </Paper>
                                </Stack>
                            </Radio.Group>
                        )}

                        {/* New Car Inputs (Only if "new" selected) */}
                        {selectedCarId === 'new' && (
                            <Box mt="md">
                                <Title order={6} mb="sm">{t('rides.create.labels.vehicleInfoOptional')}</Title>
                                <Stack gap="sm">
                                    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                                        <TextInput
                                            label={t('rides.create.labels.make')}
                                            placeholder={t('rides.create.placeholders.make')}
                                            value={carMake}
                                            onChange={(e) => setCarMake(e.currentTarget.value)}
                                        />
                                        <TextInput
                                            label={t('rides.create.labels.model')}
                                            placeholder={t('rides.create.placeholders.model')}
                                            value={carModel}
                                            onChange={(e) => setCarModel(e.currentTarget.value)}
                                        />
                                    </SimpleGrid>
                                    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                                        <TextInput
                                            label={t('rides.create.labels.color')}
                                            placeholder={t('rides.create.placeholders.color')}
                                            value={carColor}
                                            onChange={(e) => setCarColor(e.currentTarget.value)}
                                        />
                                        <TextInput
                                            label={t('rides.create.labels.year')}
                                            placeholder={t('rides.create.placeholders.year')}
                                            value={carYear}
                                            onChange={(e) => setCarYear(e.currentTarget.value)}
                                        />
                                    </SimpleGrid>
                                    <TextInput
                                        label={t('rides.create.labels.plate')}
                                        placeholder={t('rides.create.placeholders.optional')}
                                        value={carPlate}
                                        onChange={(e) => setCarPlate(e.currentTarget.value)}
                                    />


                                    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                                        <NumberInput
                                            label={t('rides.create.labels.totalBigLuggage')}
                                            value={carBigLuggage}
                                            onChange={(val) => setCarBigLuggage(val === '' ? '' : Number(val))}
                                            min={0}
                                        />
                                        <NumberInput
                                            label={t('rides.create.labels.totalSmallLuggage')}
                                            value={carSmallLuggage}
                                            onChange={(val) => setCarSmallLuggage(val === '' ? '' : Number(val))}
                                            min={0}
                                        />
                                    </SimpleGrid>
                                    <NumberInput
                                        label={t('rides.create.labels.carCapacity')}
                                        description={t('rides.create.labels.carCapacityDesc')}
                                        placeholder={t('rides.create.placeholders.seats')}
                                        value={carSeats}
                                        onChange={(val) => setCarSeats(val === '' ? '' : Number(val))}
                                        min={1}
                                        required
                                    />

                                    <Text size="sm" fw={500} mt="sm">{t('cars.form.photos')}</Text>
                                    <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
                                        {[0, 1, 2, 3].map((i) => (
                                            <Box key={i} style={{ position: 'relative' }}>
                                                {carPics[i] ? (
                                                    <>
                                                        <Image
                                                            src={carPics[i]!}
                                                            alt={`Car photo ${i + 1}`}
                                                            radius="md"
                                                            h={100}
                                                            fit="cover"
                                                        />
                                                        <ActionIcon
                                                            size="xs"
                                                            color="red"
                                                            variant="filled"
                                                            style={{ position: 'absolute', top: 4, right: 4 }}
                                                            onClick={() => removeCarPic(i)}
                                                        >
                                                            <IconX size={10} />
                                                        </ActionIcon>
                                                    </>
                                                ) : (
                                                    <FileButton onChange={(file) => handleCarPicUpload(file, i)} accept="image/*">
                                                        {(props) => (
                                                            <Button
                                                                {...props}
                                                                variant="light"
                                                                color="gray"
                                                                h={100}
                                                                w="100%"
                                                                styles={{ root: { border: '1px dashed var(--mantine-color-gray-4)' } }}
                                                            >
                                                                <Stack align="center" gap={4}>
                                                                    <IconPhoto size={20} />
                                                                    <Text size="xs">{t('cars.form.addPhoto')}</Text>
                                                                </Stack>
                                                            </Button>
                                                        )}
                                                    </FileButton>
                                                )}
                                            </Box>
                                        ))}
                                    </SimpleGrid>
                                </Stack>
                            </Box>
                        )}

                        <Group justify="space-between" mt="md">
                            <Button variant="default" onClick={prevStep}>{t('rides.create.labels.back')}</Button>
                            <Button onClick={nextStep}>{t('rides.create.labels.nextLogistics')}</Button>
                        </Group>
                    </Stack>
                </Stepper.Step>

                {/* STEP 4: Logistics */}
                <Stepper.Step label={t('rides.create.steps.logistics')} description={t('rides.create.steps.logisticsDesc')}>
                    <Stack gap="md" mt="lg">
                        <Title order={4}>{t('rides.create.labels.logistics')}</Title>

                        {/* Load Template Section */}
                        {templates.length > 0 && (
                            <Paper withBorder p="sm" bg="gray.0">
                                <Select
                                    label={t('rides.create.labels.loadSavedTemplate')}
                                    placeholder={t('rides.create.placeholders.selectRuleTemplate')}
                                    data={templates.map(tmpl => ({ value: tmpl.id, label: tmpl.name || t('rides.create.defaults.unnamedTemplate') }))}
                                    value={selectedTemplate}
                                    onChange={(val) => {
                                        setSelectedTemplate(val);
                                        const tmpl = templates.find(temp => temp.id === val);
                                        if (tmpl) {
                                            if (tmpl.payment_methods) setPaymentMethods(tmpl.payment_methods);
                                            if (tmpl.payment_qr_codes) setPaymentQRCodes(tmpl.payment_qr_codes);
                                            if (tmpl.payment_handle) setPaymentHandle(tmpl.payment_handle);
                                            if (tmpl.pickup_rules) setPickupRules(tmpl.pickup_rules);
                                            if (tmpl.cancellation_policy) setCancellationPolicy(tmpl.cancellation_policy);
                                            if (tmpl.auto_accept !== undefined) setAutoAccept(tmpl.auto_accept);
                                            if (tmpl.big_luggage_lim !== null) setBigLuggage(tmpl.big_luggage_lim);
                                            if (tmpl.small_luggage_lim !== null) setSmallLuggage(tmpl.small_luggage_lim);
                                            if (tmpl.big_luggage_paid !== undefined && tmpl.big_luggage_paid !== null) setBigLuggagePaid(tmpl.big_luggage_paid);
                                            if (tmpl.small_luggage_paid !== undefined && tmpl.small_luggage_paid !== null) setSmallLuggagePaid(tmpl.small_luggage_paid);
                                            if (tmpl.big_luggage_paid_price !== undefined && tmpl.big_luggage_paid_price !== null) setBigLuggagePaidPrice(tmpl.big_luggage_paid_price);
                                            if (tmpl.small_luggage_paid_price !== undefined && tmpl.small_luggage_paid_price !== null) setSmallLuggagePaidPrice(tmpl.small_luggage_paid_price);
                                            if (tmpl.pickup_radius_meters !== null) setPickupRadius(tmpl.pickup_radius_meters);
                                            if (tmpl.drop_off_radius_meters !== null) setDropoffRadius(tmpl.drop_off_radius_meters);

                                            // Cutoff
                                            const ch = parseCutoffTimeNullable(tmpl.cutoff_time);
                                            if (ch !== null) {
                                                setCutoffEnabled(true);
                                                setCutoffHours(ch);
                                            } else {
                                                setCutoffEnabled(false);
                                                setCutoffHours(null);
                                            }

                                            // Pay Window
                                            if (tmpl.pay_window) {
                                                const pw = parsePayWindow(tmpl.pay_window);
                                                if (!isNaN(pw)) setPayWindow(pw);
                                            }

                                            // Start Check-in
                                            if (tmpl.start_check_in_hrs_before_departure) {
                                                const sch = parseStartCheckInNullable(tmpl.start_check_in_hrs_before_departure);
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
                                            if (tmpl.departure_time_flexibility) {
                                                setFlexibility(parseFlexibility(tmpl.departure_time_flexibility));

                                                setFieldSourceTemplate([
                                                    'paymentMethods', 'paymentHandle', 'pickupRules', 'cancellationPolicy', 'autoAccept',
                                                    'bigLuggage', 'smallLuggage', 'pickupRadius', 'dropoffRadius', 'flexibility', 'cutoffHours', 'payWindow', 'startCheckInHrs'
                                                ], 'Rule', tmpl.name || t('rides.create.defaults.unnamedTemplate'));

                                                notifications.show({ title: t('rides.errors.templateLoadedTitle'), message: t('rides.errors.templateLoaded'), color: 'green' });
                                            }
                                        }
                                    }}
                                    clearable
                                />
                            </Paper>
                        )}

                        <TagsInput
                            label={<Group gap="xs">{t('rides.create.labels.paymentMethods')} {renderSourceBadge('paymentMethods')}</Group>}
                            placeholder={t('rides.create.labels.paymentMethodsPlaceholder')}
                            data={['Cash', 'Venmo', 'Zelle', 'WeChat', 'Alipay (支付宝)', 'PayPal', 'CashApp']}
                            value={paymentMethods}
                            onChange={(val) => {
                                setPaymentMethods(val);
                                setFieldSourceManual(['paymentMethods']);
                            }}
                            clearable
                        />
                        <TextInput
                            label={<Group gap="xs">{t('rides.create.labels.paymentHandle')} {renderSourceBadge('paymentHandle')}</Group>}
                            description={t('rides.create.labels.paymentHandleDesc')}
                            placeholder={t('rides.create.placeholders.paymentHandle')}
                            value={paymentHandle}
                            onChange={(e) => {
                                setPaymentHandle(e.currentTarget.value);
                                setFieldSourceManual(['paymentHandle']);
                            }}
                        />

                        {/* Payment QR Code Uploads */}
                        {paymentMethods.length > 0 && (
                            <Paper withBorder p="sm" radius="md">
                                <Group gap="xs" mb="xs">
                                    <IconQrcode size={16} />
                                    <Text fw={500} size="sm">
                                        {t('rides.create.labels.paymentQRCodes')}
                                    </Text>
                                </Group>
                                <Text size="xs" c="dimmed" mb="md">
                                    {t('rides.create.labels.paymentQRCodesDesc')}
                                </Text>
                                <Stack gap="sm">
                                    {paymentMethods.map((method) => (
                                        <Paper key={method} withBorder p="xs" radius="sm" bg="gray.0">
                                            <Group justify="space-between" wrap="nowrap">
                                                <Text size="sm" fw={500}>{method}</Text>
                                                <Group gap="xs">
                                                    {paymentQRCodes[method] ? (
                                                        <>
                                                            <Image
                                                                src={paymentQRCodes[method]}
                                                                alt={`${method} QR Code`}
                                                                w={48}
                                                                h={48}
                                                                radius="sm"
                                                                fit="contain"
                                                            />
                                                            <ActionIcon
                                                                variant="light"
                                                                color="red"
                                                                onClick={() => removeQRCode(method)}
                                                                title={t('rides.create.labels.removeQRCode')}
                                                            >
                                                                <IconTrash size={16} />
                                                            </ActionIcon>
                                                        </>
                                                    ) : (
                                                        <FileButton
                                                            onChange={(file) => handleQRCodeUpload(file, method)}
                                                            accept="image/*"
                                                        >
                                                            {(props) => (
                                                                <Button
                                                                    {...props}
                                                                    variant="light"
                                                                    size="xs"
                                                                    leftSection={<IconUpload size={14} />}
                                                                >
                                                                    {t('rides.create.labels.uploadQRCode')}
                                                                </Button>
                                                            )}
                                                        </FileButton>
                                                    )}
                                                </Group>
                                            </Group>
                                        </Paper>
                                    ))}
                                </Stack>
                            </Paper>
                        )}
                        <Textarea
                            label={<Group gap="xs">{t('rides.create.labels.pickupRules')} {renderSourceBadge('pickupRules')}</Group>}
                            placeholder={t('rides.create.labels.pickupRulesPlaceholder')}
                            value={pickupRules}
                            onChange={(e) => {
                                setPickupRules(e.currentTarget.value);
                                setFieldSourceManual(['pickupRules']);
                            }}
                            minRows={2}
                        />
                        <Textarea
                            label={<Group gap="xs">{t('rides.create.labels.cancelPolicy')} {renderSourceBadge('cancellationPolicy')}</Group>}
                            placeholder={t('rides.create.labels.cancelPolicyPlaceholder')}
                            value={cancellationPolicy}
                            onChange={(e) => {
                                setCancellationPolicy(e.currentTarget.value);
                                setFieldSourceManual(['cancellationPolicy']);
                            }}
                            minRows={2}
                        />


                        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                            <NumberInput
                                label={<Group gap="xs">{t('rides.create.labels.bigLuggageCap')} {renderSourceBadge('bigLuggage')}</Group>}
                                description={t('rides.create.labels.largeSuitcases')}
                                value={bigLuggage}
                                required
                                onChange={(val) => {
                                    setBigLuggage(val === '' ? '' : Number(val));
                                    setFieldSourceManual(['bigLuggage']);
                                }}
                                min={0}
                            />
                            <NumberInput
                                label={<Group gap="xs">{t('rides.create.labels.smallLuggageCap')} {renderSourceBadge('smallLuggage')}</Group>}
                                description={t('rides.create.labels.carryOns')}
                                value={smallLuggage}
                                required
                                onChange={(val) => {
                                    setSmallLuggage(val === '' ? '' : Number(val));
                                    setFieldSourceManual(['smallLuggage']);
                                }}
                                min={0}
                            />
                        </SimpleGrid>

                        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                            <NumberInput
                                label={<Group gap="xs">{t('rides.create.labels.paidBigLuggageCap')} {renderSourceBadge('bigLuggagePaid')}</Group>}
                                value={bigLuggagePaid}
                                onChange={(val) => {
                                    setBigLuggagePaid(val === '' ? '' : Number(val));
                                    setFieldSourceManual(['bigLuggagePaid']);
                                }}
                                min={0}
                            />
                            <NumberInput
                                label={<Group gap="xs">{t('rides.create.labels.paidSmallLuggageCap')} {renderSourceBadge('smallLuggagePaid')}</Group>}
                                value={smallLuggagePaid}
                                onChange={(val) => {
                                    setSmallLuggagePaid(val === '' ? '' : Number(val));
                                    setFieldSourceManual(['smallLuggagePaid']);
                                }}
                                min={0}
                            />
                        </SimpleGrid>

                        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                            <NumberInput
                                label={<Group gap="xs">{t('rides.create.labels.paidBigLuggagePrice')} {renderSourceBadge('bigLuggagePaidPrice')}</Group>}
                                value={bigLuggagePaidPrice}
                                onChange={(val) => {
                                    setBigLuggagePaidPrice(val === '' ? '' : Number(val));
                                    setFieldSourceManual(['bigLuggagePaidPrice']);
                                }}
                                min={0}
                                disabled={!bigLuggagePaid || bigLuggagePaid === 0}
                            />
                            <NumberInput
                                label={<Group gap="xs">{t('rides.create.labels.paidSmallLuggagePrice')} {renderSourceBadge('smallLuggagePaidPrice')}</Group>}
                                value={smallLuggagePaidPrice}
                                onChange={(val) => {
                                    setSmallLuggagePaidPrice(val === '' ? '' : Number(val));
                                    setFieldSourceManual(['smallLuggagePaidPrice']);
                                }}
                                min={0}
                                disabled={!smallLuggagePaid || smallLuggagePaid === 0}
                            />
                        </SimpleGrid>
                        <Group justify="space-between" mt="md">
                            <Button variant="default" onClick={prevStep}>{t('rides.create.labels.back')}</Button>
                            <Button onClick={nextStep}>{t('rides.create.labels.nextSettings')}</Button>
                        </Group>
                    </Stack>
                </Stepper.Step>

                {/* STEP 5: Settings */}
                <Stepper.Step label={t('rides.create.steps.settings')} description={t('rides.create.steps.settingsDesc')}>
                    <Stack gap="md" mt="lg">
                        <Title order={4}>{t('rides.create.labels.settings')}</Title>
                        <Title order={5}>{t('rides.create.labels.advancedSettings')}</Title>
                        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                            <NumberInput
                                label={<Group gap="xs">{t('rides.create.labels.pickupRadius')} {renderSourceBadge('pickupRadius')}</Group>}
                                value={pickupRadius}
                                onChange={(val) => {
                                    setPickupRadius(val === '' ? '' : Number(val));
                                    setFieldSourceManual(['pickupRadius']);
                                }}
                                min={0}
                                description={t('rides.create.labels.pickupRadiusDesc')}
                                required
                                step={100}
                            />
                            <NumberInput
                                label={<Group gap="xs">{t('rides.create.labels.dropoffRadius')} {renderSourceBadge('dropoffRadius')}</Group>}
                                value={dropoffRadius}
                                onChange={(val) => {
                                    setDropoffRadius(val === '' ? '' : Number(val));
                                    setFieldSourceManual(['dropoffRadius']);
                                }}
                                min={0}
                                description={t('rides.create.labels.dropoffRadiusDesc')}
                                required
                                step={100}
                            />
                        </SimpleGrid>

                        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                            <Box>
                                {startCoords && (
                                    <RadiusMap
                                        lat={startCoords.lat}
                                        lng={startCoords.lng}
                                        radiusMeters={Number(pickupRadius) || 10000}
                                        type="pickup"
                                    />
                                )}
                            </Box>
                            <Box>
                                {endCoords && (
                                    <RadiusMap
                                        lat={endCoords.lat}
                                        lng={endCoords.lng}
                                        radiusMeters={Number(dropoffRadius) || 10000}
                                        type="dropoff"
                                    />
                                )}
                            </Box>
                        </SimpleGrid>
                        <Accordion variant="separated">
                            <Accordion.Item value="settings">
                                <Accordion.Control>{t('rides.create.labels.advancedRules')}</Accordion.Control>
                                <Accordion.Panel>
                                    <Stack gap="md">
                                        <Switch
                                            label={<Group gap="xs">{t('rides.create.labels.autoAccept')} {renderSourceBadge('autoAccept')}</Group>}
                                            description={t('rides.create.labels.autoAcceptDesc')}
                                            checked={autoAccept}
                                            onChange={(e) => {
                                                setAutoAccept(e.currentTarget.checked);
                                                setFieldSourceManual(['autoAccept']);
                                            }}
                                        />
                                        <Switch
                                            label={<Group gap="xs">{t('rides.create.labels.autoStartCheckIn')} {renderSourceBadge('startCheckInHrs')}</Group>}
                                            description={t('rides.create.labels.autoStartCheckInDesc')}
                                            checked={startCheckInEnabled}
                                            onChange={(e) => {
                                                setStartCheckInEnabled(e.currentTarget.checked);
                                                setStartCheckInHrs(e.currentTarget.checked ? 3 : '');
                                                setFieldSourceManual(['startCheckInHrs']);
                                            }}
                                        />
                                        {startCheckInEnabled && (
                                            <NumberInput
                                                label={t('rides.create.labels.autoCheckIn')}
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
                                            label={t('rides.create.labels.enableCutoff')}
                                            description={t('rides.create.labels.enableCutoffDesc')}
                                            checked={cutoffEnabled}
                                            onChange={(e) => {
                                                setCutoffEnabled(e.currentTarget.checked);
                                                setCutoffHours(e.currentTarget.checked ? 3 : null);
                                            }}
                                        />
                                        {cutoffEnabled && (
                                            <NumberInput
                                                label={<Group gap="xs">{t('rides.create.labels.hoursBefore')} {renderSourceBadge('cutoffHours')}</Group>}
                                                description={t('rides.create.labels.hoursBeforeDesc')}
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
                                            label={<Group gap="xs">{t('rides.create.labels.payWindow')} {renderSourceBadge('payWindow')}</Group>}
                                            description={t('rides.create.labels.payWindowDesc')}
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
                            label={<Group gap="xs">{t('rides.create.labels.tripNotes')} {renderSourceBadge('notes')}</Group>}
                            placeholder={t('rides.create.labels.tripNotesPlaceholder')}
                            minRows={3}
                            value={notes}
                            onChange={(e) => {
                                setNotes(e.currentTarget.value);
                                setFieldSourceManual(['notes']);
                            }}
                        />

                        <Divider />

                        <Checkbox
                            label={t('rides.create.labels.saveLogisticsTemplate')}
                            checked={saveTemplate}
                            onChange={(e) => setSaveTemplate(e.currentTarget.checked)}
                        />
                        <Checkbox
                            label={t('rides.create.labels.saveTripTemplate')}
                            checked={saveTripTemplate}
                            onChange={(e) => setSaveTripTemplate(e.currentTarget.checked)}
                        />

                        {(saveTemplate && saveTripTemplate) && (
                            <Checkbox
                                label={t('rides.create.labels.linkTemplate')}
                                description={t('rides.create.labels.linkTemplateDesc')}
                                checked={linkTemplates}
                                onChange={(e) => setLinkTemplates(e.currentTarget.checked)}
                                ml="xl"
                            />
                        )}

                        {saveTemplate && (
                            <TextInput
                                label={t('rides.create.labels.ruleTemplateName')}
                                placeholder={t('rides.create.placeholders.ruleTemplateName')}
                                value={ruleTemplateName}
                                onChange={(e) => setRuleTemplateName(e.currentTarget.value)}
                                required
                            />
                        )}

                        {saveTripTemplate && (
                            <TextInput
                                label={t('rides.create.labels.tripTemplateName')}
                                placeholder={t('rides.create.placeholders.tripTemplateName')}
                                value={tripTemplateName}
                                onChange={(e) => setTripTemplateName(e.currentTarget.value)}
                                required
                            />
                        )}

                        <Group justify="space-between" mt="md">
                            <Button variant="default" onClick={prevStep}>{t('rides.create.labels.back')}</Button>
                            <Button color="blue" onClick={handleFinalSubmit}>{t('rides.create.labels.postTrip')}</Button>
                        </Group>
                    </Stack>
                </Stepper.Step>

                <Stepper.Completed>
                    <Stack align="center" mt="lg" gap="md">
                        <Title order={3}>{t('rides.create.completion.title')}</Title>
                        <Text>{t('rides.create.completion.subtitle')}</Text>

                        {pushPermission === 'denied' && (
                            <Text size="sm" c="red">{t('rides.create.completion.enableInBrowser')}</Text>
                        )}
                        {pushPermission === 'default' && (
                            <Text size="sm">
                                <Anchor component="button" onClick={() => {
                                    // iOS Safari: Redirect to root for PWA install
                                    if (isIOS && !isStandalone) {
                                        router.push('/?pwa_ios_install=true');
                                    } else {
                                        showPrompt({ force: true });
                                    }
                                }}>
                                    {t('rides.create.completion.enablePushLink')}
                                </Anchor>
                                {' '}{t('rides.create.completion.enablePushSuffix')}
                            </Text>
                        )}

                        <Text size="sm" c="dimmed">{t('rides.create.completion.redirecting', { countdown: redirectCountdown })}</Text>
                        <Group>
                            <Button variant="outline" onClick={resetForm}>{t('rides.create.completion.startNewDraft')}</Button>
                            <Button onClick={() => { localStorage.removeItem('trip_draft'); router.push(postedLink) }}>{t('rides.create.completion.viewPost')}</Button>
                        </Group>
                    </Stack>
                </Stepper.Completed>
            </Stepper>

            <Modal opened={authModalOpen} onClose={() => setAuthModalOpen(false)} title={t('rides.create.modals.auth.title')} centered>
                <Stack gap="md">
                    <Text>
                        {t('rides.create.modals.auth.message')}
                    </Text>
                    <Group justify="flex-end">
                        <Button variant="default" onClick={() => setAuthModalOpen(false)}>{t('rides.create.modals.auth.cancel')}</Button>
                        <Button onClick={() => {
                            if (user) {
                                setAuthModalOpen(false);
                            } else {
                                handleProtectedAction();
                            }
                        }}>
                            {t('rides.create.modals.auth.login')}
                        </Button>
                    </Group>

                </Stack>
            </Modal>

            <Modal opened={profileModalOpen} onClose={() => setProfileModalOpen(false)} title={t('rides.create.modals.profile.title')} centered>
                <Stack gap="md">
                    <Text>
                        {t('rides.create.modals.profile.message')}
                    </Text>
                    <Group justify="flex-end">
                        <Button variant="default" onClick={() => setProfileModalOpen(false)}>{t('rides.create.modals.profile.cancel')}</Button>
                        <Button onClick={() => {
                            router.push('/complete-profile?returnUrl=/newRide');
                        }}>
                            {t('rides.create.modals.profile.goToProfile')}
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Paper>
    );
}
