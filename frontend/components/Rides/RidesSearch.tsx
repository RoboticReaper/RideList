'use client';

import { useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { DEFAULT_AUTOCOMPLETE_LOCATIONS } from '@/utils/defaultLocations';
import {
    Paper,
    Button,
    Autocomplete,
    Loader as MantineLoader,
    ActionIcon,
    NumberInput,
    MultiSelect,
    Switch,
    Group,
    Box,
    Collapse,
    Text,
    Grid,
    Stack,
    Divider,
    RangeSlider,
    Input,
    SimpleGrid,
    TagsInput
} from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import { IconMapPin, IconCalendar, IconX, IconSearch, IconAdjustments, IconCurrencyDollar, IconLuggage, IconCreditCard, IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { notifications } from '@mantine/notifications';

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

interface RidesSearchProps {
    onSearch?: () => void;
}

export function RidesSearch({ onSearch }: RidesSearchProps) {
    const router = useRouter();
    const { t } = useTranslation('common');

    const searchParams = useSearchParams();

    // --- Search State ---
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
    const [startCoords, setStartCoords] = useState<{ lat: number; lng: number } | null>(null);
    const [endCoords, setEndCoords] = useState<{ lat: number; lng: number } | null>(null);


    const [startSuggestions, setStartSuggestions] = useState<string[]>([]);
    const [endSuggestions, setEndSuggestions] = useState<string[]>([]);
    const [loadingStart, setLoadingStart] = useState(false);
    const [loadingEnd, setLoadingEnd] = useState(false);

    // Validation State
    const [startError, setStartError] = useState<string | null>(null);
    const [endError, setEndError] = useState<string | null>(null);

    // --- Advanced Search State ---
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [bigLuggage, setBigLuggage] = useState<number | ''>('');
    const [smallLuggage, setSmallLuggage] = useState<number | ''>('');
    const [priceMax, setPriceMax] = useState<number | ''>('');
    const [paymentMethods, setPaymentMethods] = useState<string[]>([]);
    const [autoAccept, setAutoAccept] = useState(false);

    // Initialize from URL Params OR LocalStorage
    useEffect(() => {
        // Check if we have any search params
        const hasParams = searchParams.toString().length > 0;

        if (hasParams) {
            const startLoc = searchParams.get('start_location');
            const startLat = searchParams.get('start_lat');
            const startLng = searchParams.get('start_lng');

            const endLoc = searchParams.get('end_location');
            const endLat = searchParams.get('end_lat');
            const endLng = searchParams.get('end_lng');

            const dateStr = searchParams.get('date');

            const bigLug = searchParams.get('big_luggage');
            const smallLug = searchParams.get('small_luggage');
            const price = searchParams.get('price_max');
            const payments = searchParams.get('payment_methods');
            const auto = searchParams.get('auto_accept');

            if (startLoc) {
                setStartLocation(startLoc);
                startLastSelection.current = startLoc;
                setIsStartSelected(true);
                if (startLat && startLng) {
                    setStartCoords({ lat: parseFloat(startLat), lng: parseFloat(startLng) });
                }
            }

            if (endLoc) {
                setEndLocation(endLoc);
                endLastSelection.current = endLoc;
                setIsEndSelected(true);
                if (endLat && endLng) {
                    setEndCoords({ lat: parseFloat(endLat), lng: parseFloat(endLng) });
                }
            }

            if (dateStr) {
                setStartTime(new Date(dateStr));
            }

            if (bigLug) setBigLuggage(Number(bigLug));
            if (smallLug) setSmallLuggage(Number(smallLug));
            if (price) setPriceMax(Number(price));
            if (payments) setPaymentMethods(payments.split(','));
            if (auto === 'true') setAutoAccept(true);
            else if (auto === 'false') setAutoAccept(false);

            // Open advanced if any advanced filters are set
            if (bigLug || smallLug || price || payments || (auto === 'true')) {
                setAdvancedOpen(true);
            }
        } else {
            // No URL params: Try to restore from LocalStorage
            try {
                const saved = localStorage.getItem('ride_search_last_state');
                if (saved) {
                    const parsed = JSON.parse(saved);
                    // Hydrate state
                    if (parsed.startLocation) {
                        setStartLocation(parsed.startLocation);
                        startLastSelection.current = parsed.startLocation;
                    }
                    if (parsed.startCoords) setStartCoords(parsed.startCoords);

                    if (parsed.endLocation) {
                        setEndLocation(parsed.endLocation);
                        endLastSelection.current = parsed.endLocation;
                    }
                    if (parsed.endCoords) setEndCoords(parsed.endCoords);

                    if (parsed.startTime) setStartTime(new Date(parsed.startTime));

                    if (parsed.bigLuggage !== undefined) setBigLuggage(parsed.bigLuggage);
                    if (parsed.smallLuggage !== undefined) setSmallLuggage(parsed.smallLuggage);
                    if (parsed.priceMax !== undefined) setPriceMax(parsed.priceMax);
                    if (parsed.paymentMethods) setPaymentMethods(parsed.paymentMethods);
                    if (parsed.autoAccept !== undefined) setAutoAccept(parsed.autoAccept);
                    if (parsed.advancedOpen !== undefined) setAdvancedOpen(parsed.advancedOpen);

                    // If we have minimal required fields (locations), trigger navigation to "apply" the search
                    // This updates the URL so the server fetches data
                    if (parsed.startLocation || parsed.endLocation || parsed.startTime) {
                        const query = new URLSearchParams();
                        if (parsed.startLocation) query.append('start_location', parsed.startLocation);
                        if (parsed.endLocation) query.append('end_location', parsed.endLocation);
                        if (parsed.startTime) query.append('date', parsed.startTime); // saved as ISO string likely
                        if (parsed.bigLuggage !== '' && parsed.bigLuggage !== undefined) query.append('big_luggage', parsed.bigLuggage.toString());
                        if (parsed.smallLuggage !== '' && parsed.smallLuggage !== undefined) query.append('small_luggage', parsed.smallLuggage.toString());
                        if (parsed.priceMax !== '' && parsed.priceMax !== undefined) query.append('price_max', parsed.priceMax.toString());
                        if (parsed.paymentMethods && parsed.paymentMethods.length > 0) query.append('payment_methods', parsed.paymentMethods.join(','));
                        if (parsed.autoAccept === true) query.append('auto_accept', 'true');
                        else if (parsed.autoAccept === false) query.append('auto_accept', 'false');

                        if (parsed.startCoords) {
                            query.append('start_lat', parsed.startCoords.lat.toString());
                            query.append('start_lng', parsed.startCoords.lng.toString());
                        }
                        if (parsed.endCoords) {
                            query.append('end_lat', parsed.endCoords.lat.toString());
                            query.append('end_lng', parsed.endCoords.lng.toString());
                        }
                        router.replace(`/search?${query.toString()}`);
                    }
                }
            } catch (e) {
                console.error("Failed to restore search state", e);
            }
        }
    }, [searchParams]);

    // Save Advanced Toggle when it changes
    useEffect(() => {
        try {
            const saved = localStorage.getItem('ride_search_last_state');
            const state = saved ? JSON.parse(saved) : {};
            state.advancedOpen = advancedOpen;
            localStorage.setItem('ride_search_last_state', JSON.stringify(state));
        } catch (e) {
            // Ignore
        }
    }, [advancedOpen]);

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

    // Helper to fetch Place ID from text query (used for default options)
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


    const debounceTimeout = useRef<NodeJS.Timeout | null>(null);
    const debounceFetch = (query: string, setSuggestions: (data: string[]) => void, setLoading: (l: boolean) => void, sessionToken: string) => {
        if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
        debounceTimeout.current = setTimeout(() => {
            fetchPlaces(query, setSuggestions, setLoading, sessionToken);
        }, 300);
    };

    const fetchPlaceDetails = async (placeId: string, setCoords: (c: { lat: number; lng: number } | null) => void) => {
        try {
            const apiKey = process.env.NEXT_PUBLIC_PLACES_AUTOCOMPLETE!;
            const response = await fetch(`https://places.googleapis.com/v1/places/${placeId}?fields=location`, {
                headers: {
                    'X-Goog-Api-Key': apiKey,
                },
            });
            if (!response.ok) {
                console.error("Place details error", await response.text());
                return;
            }
            const data = await response.json();
            if (data.location) {
                setCoords({ lat: data.location.latitude, lng: data.location.longitude });
            }
        } catch (error) {
            console.error("Failed to fetch place details", error);
        }
    };


    const handleStartChange = (val: string) => {
        setStartLocation(val);
        setStartError(null);
        if (val !== startLastSelection.current) {
            setIsStartSelected(false);
            startLastSelection.current = '';
            setStartPlaceId(null);
            setStartCoords(null);
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
        setEndError(null);
        if (val !== endLastSelection.current) {
            setIsEndSelected(false);
            endLastSelection.current = '';
            setEndPlaceId(null);
            setEndCoords(null);
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
        setStartCoords(null);
        setStartSuggestions([]);
        setStartError(null);
    };

    const clearEnd = () => {
        setEndLocation('');
        setIsEndSelected(false);
        endLastSelection.current = '';
        setEndPlaceId(null);
        setEndCoords(null);
        setEndSuggestions([]);
        setEndError(null);
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

    const handleSearch = () => {
        let hasError = false;

        // Validation: If text exists but no coords (meaning user typed but didn't select valid option)
        if (startLocation && !startCoords) {
            setStartError(t('rides.errors.invalidStart'));
            hasError = true;
        }

        if (endLocation && !endCoords) {
            setEndError(t('rides.errors.invalidEnd'));
            hasError = true;
        }

        if (hasError) return;

        const query = new URLSearchParams();
        if (startLocation) query.append('start_location', startLocation);
        if (endLocation) query.append('end_location', endLocation);
        if (startTime) query.append('date', startTime.toISOString());
        if (bigLuggage !== '') query.append('big_luggage', bigLuggage.toString());
        if (smallLuggage !== '') query.append('small_luggage', smallLuggage.toString());
        if (priceMax !== '') query.append('price_max', priceMax.toString());
        if (paymentMethods.length > 0) query.append('payment_methods', paymentMethods.join(','));
        if (autoAccept) query.append('auto_accept', 'true');
        else query.append('auto_accept', 'false'); // Explicitly add false if disabled? Or just omit if default is true? User said "autoAccept" state is boolean.

        if (startCoords) {
            query.append('start_lat', startCoords.lat.toString());
            query.append('start_lng', startCoords.lng.toString());
        }
        if (endCoords) {
            query.append('end_lat', endCoords.lat.toString());
            query.append('end_lng', endCoords.lng.toString());
        }

        // Save to LocalStorage
        try {
            const stateToSave = {
                startLocation,
                startCoords,
                endLocation,
                endCoords,
                startTime: startTime ? startTime.toISOString() : null,
                bigLuggage,
                smallLuggage,
                priceMax,
                paymentMethods,
                autoAccept,
                advancedOpen
            };
            localStorage.setItem('ride_search_last_state', JSON.stringify(stateToSave));
        } catch (e) {
            console.error("Failed to save search state", e);
        }

        router.push(`/search?${query.toString()}`);
        onSearch?.(); // Call the onSearch prop if provided
    };

    return (
        <Stack gap="md" w="100%">
            <Paper shadow="sm" radius="md" p="md" withBorder w="100%">
                <Grid align="flex-end" gutter="md" w="100%">
                    <Grid.Col span={{ base: 12, md: 3 }}>
                        <Autocomplete
                            label={t('rides.common.startLocation')}
                            placeholder={t('rides.search.startPlaceholder')}
                            data={startSuggestions}
                            value={startLocation}
                            onChange={handleStartChange}
                            onFocus={() => {
                                if (!startLocation) setStartSuggestions(DEFAULT_AUTOCOMPLETE_LOCATIONS);
                            }}
                            onOptionSubmit={async (val) => {
                                setIsStartSelected(true);
                                startLastSelection.current = val;
                                let pid = predictionsMap.current.get(val) || null;

                                // If selected a default option that wasn't in our prediction map yet
                                if (!pid && DEFAULT_AUTOCOMPLETE_LOCATIONS.includes(val)) {
                                    // We need to fetch the ID separately effectively doing a 1-result search
                                    if (!startSessionToken.current) startSessionToken.current = crypto.randomUUID();
                                    pid = await fetchPlaceIdFromQuery(val, startSessionToken.current);
                                }

                                setStartPlaceId(pid);
                                if (pid) fetchPlaceDetails(pid, setStartCoords);
                            }}
                            leftSection={<IconMapPin size={16} />}
                            rightSection={renderRightSection(loadingStart, startLocation, clearStart)}
                            error={startError}
                        />

                    </Grid.Col>
                    <Grid.Col span={{ base: 12, md: 3 }}>
                        <Autocomplete
                            label={t('rides.common.endLocation')}
                            placeholder={t('rides.search.endPlaceholder')}
                            data={endSuggestions}
                            value={endLocation}
                            onChange={handleEndChange}
                            onFocus={() => {
                                if (!endLocation) setEndSuggestions(DEFAULT_AUTOCOMPLETE_LOCATIONS);
                            }}
                            onOptionSubmit={async (val) => {
                                setIsEndSelected(true);
                                endLastSelection.current = val;
                                let pid = predictionsMap.current.get(val) || null;

                                if (!pid && DEFAULT_AUTOCOMPLETE_LOCATIONS.includes(val)) {
                                    if (!endSessionToken.current) endSessionToken.current = crypto.randomUUID();
                                    pid = await fetchPlaceIdFromQuery(val, endSessionToken.current);
                                }

                                setEndPlaceId(pid);
                                if (pid) fetchPlaceDetails(pid, setEndCoords);
                            }}
                            leftSection={<IconMapPin size={16} />}
                            rightSection={renderRightSection(loadingEnd, endLocation, clearEnd)}
                            error={endError}
                        />

                    </Grid.Col>
                    <Grid.Col span={{ base: 12, md: 3 }}>
                        <DateTimePicker
                            dropdownType="modal"
                            label={t('rides.search.dateLabel')}
                            placeholder={t('rides.search.datePlaceholder')}
                            value={startTime}
                            valueFormat="MM/DD/YYYY HH:mm"
                            onChange={(val) => {
                                if (typeof val === 'string') {
                                    setStartTime(new Date(val));
                                } else {
                                    setStartTime(val);
                                }
                            }}
                            leftSection={<IconCalendar size={16} />}
                            minDate={new Date()}
                            clearable
                        />
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, md: 3 }}>
                        <Group grow gap="xs">
                            <Button
                                leftSection={<IconSearch size={16} />}
                                onClick={handleSearch}
                            >
                                {t('rides.search.searchBtn')}
                            </Button>
                            <Button
                                variant="light"
                                onClick={() => setAdvancedOpen((o) => !o)}
                                aria-label="More Filters"
                                color={advancedOpen ? 'blue' : 'gray'}
                                leftSection={advancedOpen ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
                            >
                                {advancedOpen ? t('rides.search.hide') : t('rides.search.more')}
                            </Button>
                        </Group>
                    </Grid.Col>
                </Grid>

                <Collapse in={advancedOpen}>
                    <Divider my="md" label={t('rides.search.advancedFilters')} labelPosition="center" />
                    <SimpleGrid cols={{ base: 1, sm: 2, md: 4, lg: 5 }} spacing="sm" verticalSpacing="sm">
                        <NumberInput
                            label={t('rides.common.bigLuggage')}
                            placeholder="0"
                            min={0}
                            value={bigLuggage}
                            onChange={(val) => setBigLuggage(val === '' ? '' : Number(val))}
                            leftSection={<IconLuggage size={16} />}
                        />
                        <NumberInput
                            label={t('rides.common.smallLuggage')}
                            placeholder="0"
                            min={0}
                            value={smallLuggage}
                            onChange={(val) => setSmallLuggage(val === '' ? '' : Number(val))}
                            leftSection={<IconLuggage size={16} />}
                        />
                        <NumberInput
                            label={t('rides.search.maxPrice')}
                            placeholder={t('rides.search.maxPrice')}
                            min={0}
                            value={priceMax}
                            onChange={(val) => setPriceMax(val === '' ? '' : Number(val))}
                            leftSection={<IconCurrencyDollar size={16} />}
                        />
                        <TagsInput
                            label={t('rides.common.paymentMethods')}
                            placeholder={t('rides.search.paymentPlaceholder')}
                            data={['Cash', 'Venmo', 'Zelle', 'WeChat', 'CashApp']}
                            value={paymentMethods}
                            onChange={setPaymentMethods}
                            leftSection={<IconCreditCard size={16} />}
                            clearable
                        />
                        <Switch
                            label={t('rides.search.autoAcceptOnly')}
                            checked={autoAccept}
                            onChange={(event) => setAutoAccept(event.currentTarget.checked)}
                            mt={24}
                        />
                    </SimpleGrid>
                </Collapse>
            </Paper >
        </Stack >
    );
}
