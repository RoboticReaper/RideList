import { useState, useRef } from 'react';
import { Paper, Title, Text, Group, Stack, Alert, Box, SimpleGrid, Button, Flex, Badge, Modal, Switch, Textarea, Select, Autocomplete, ActionIcon, Loader, Avatar, NumberInput } from '@mantine/core';
import { IconAlertTriangle, IconInfoCircle, IconCash, IconUserCheck, IconCalendar, IconLuggage, IconArmchair, IconClock, IconCreditCard, IconSteeringWheel, IconPhone, IconNote, IconMapPin, IconEdit, IconX, IconExclamationCircle } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { DateTimePicker } from '@mantine/dates';
import { useTranslation, Trans } from 'react-i18next';
import { LocalizedLink } from '@/components/LocalizedLink';
import { FuzzyRadiusMap } from '@/components/Rides/FuzzyRadiusMap';
import { notifications } from '@mantine/notifications';
import { useAuth } from '@/components/firebase/AuthContext';
import { intervalToHours } from '@/utils/intervalParsers';
import { getTripStatusConfig, getBookingStatusConfig } from '@/utils/statusUtils';

interface RiderTripViewProps {
    trip: any;
    onRefresh: () => void;
}

function formatFlexibility(interval: any) {
    if (!interval) return '';
    if (typeof interval === 'string') return `(+/- ${interval})`;
    if (typeof interval === 'number') return `(+/- ${interval}h)`;

    const parts = [];
    if (interval.hours) parts.push(`${interval.hours}h`);
    if (interval.minutes) parts.push(`${interval.minutes}m`);

    if (parts.length === 0) return '';
    return `(+/- ${parts.join(' ')})`;
}

const InfoItem = ({ label, value }: { label: string, value: React.ReactNode }) => (
    <Box>
        <Text c="dimmed" size="xs">{label}</Text>
        <Text size="sm" fw={500} component="div">{value}</Text>
    </Box>
);

export function RiderTripView({ trip, onRefresh }: RiderTripViewProps) {
    const { t } = useTranslation('common');
    const { user } = useAuth();
    const [markingPaid, setMarkingPaid] = useState(false);
    const [markingReady, setMarkingReady] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const [cancelModalOpen, setCancelModalOpen] = useState(false);
    const [viewingSnapshot, setViewingSnapshot] = useState(false);

    // Edit mode state
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [editRiderNote, setEditRiderNote] = useState('');
    const [editPaymentMethod, setEditPaymentMethod] = useState('');
    const [editPreferredPickupTime, setEditPreferredPickupTime] = useState<Date | null>(null);
    const [editSeats, setEditSeats] = useState(1);
    const [editBigLuggage, setEditBigLuggage] = useState(0);
    const [editSmallLuggage, setEditSmallLuggage] = useState(0);

    // Pickup location autocomplete state
    const [pickupLocation, setPickupLocation] = useState('');
    const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number } | null>(null);
    const [pickupSuggestions, setPickupSuggestions] = useState<string[]>([]);
    const [loadingPickup, setLoadingPickup] = useState(false);
    const [pickupError, setPickupError] = useState<string | null>(null);
    const pickupSessionToken = useRef<string>(typeof crypto !== 'undefined' ? crypto.randomUUID() : '');
    const pickupLastSelection = useRef<string>('');
    const pickupPredictionsMap = useRef<Map<string, string>>(new Map());
    const pickupDebounceTimeout = useRef<NodeJS.Timeout | null>(null);

    // Places autocomplete functions
    const fetchPickupPlaces = async (query: string) => {
        if (!query || query.length < 3) {
            setPickupSuggestions([]);
            return;
        }
        setLoadingPickup(true);
        try {
            const apiKey = process.env.NEXT_PUBLIC_PLACES_AUTOCOMPLETE!;
            const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey },
                body: JSON.stringify({ input: query, sessionToken: pickupSessionToken.current }),
            });
            if (!response.ok) { setLoadingPickup(false); return; }
            const data = await response.json();
            const newSuggestions: string[] = [];
            const seenTexts = new Set<string>();
            (data.suggestions || []).forEach((item: any) => {
                const text = item.placePrediction.text.text;
                const id = item.placePrediction.placeId;
                if (!seenTexts.has(text)) {
                    seenTexts.add(text);
                    newSuggestions.push(text);
                    pickupPredictionsMap.current.set(text, id);
                }
            });
            setPickupSuggestions(newSuggestions);
        } catch (error) { console.error("Failed to fetch places", error); }
        finally { setLoadingPickup(false); }
    };

    const debounceFetchPickup = (query: string) => {
        if (pickupDebounceTimeout.current) clearTimeout(pickupDebounceTimeout.current);
        pickupDebounceTimeout.current = setTimeout(() => fetchPickupPlaces(query), 300);
    };

    const fetchPickupPlaceDetails = async (placeId: string) => {
        try {
            const apiKey = process.env.NEXT_PUBLIC_PLACES_AUTOCOMPLETE!;
            const response = await fetch(`https://places.googleapis.com/v1/places/${placeId}?fields=location,formattedAddress`, {
                headers: { 'X-Goog-Api-Key': apiKey },
            });
            if (!response.ok) return;
            const data = await response.json();
            if (data.location) setPickupCoords({ lat: data.location.latitude, lng: data.location.longitude });
            if (data.formattedAddress) {
                setPickupLocation(data.formattedAddress);
                pickupLastSelection.current = data.formattedAddress;
            }
        } catch (error) { console.error("Failed to fetch place details", error); }
    };

    const handlePickupChange = (val: string) => {
        setPickupLocation(val);
        setPickupError(null);
        if (val !== pickupLastSelection.current) {
            pickupLastSelection.current = '';
            setPickupCoords(null);
        }
        if (!pickupSessionToken.current) pickupSessionToken.current = crypto.randomUUID();
        debounceFetchPickup(val);
    };

    const clearPickup = () => {
        setPickupLocation('');
        pickupLastSelection.current = '';
        setPickupCoords(null);
        setPickupSuggestions([]);
        setPickupError(null);
    };

    const startEditing = () => {
        setEditRiderNote(trip.user_booking?.rider_note || '');
        setEditPaymentMethod(trip.user_booking?.intended_payment_method || '');
        setPickupLocation(trip.user_booking?.pickup_location_text || '');
        pickupLastSelection.current = trip.user_booking?.pickup_location_text || '';
        setPickupCoords(null); // Will be set if user changes location
        setEditPreferredPickupTime(trip.user_booking?.preferred_pickup_time ? new Date(trip.user_booking.preferred_pickup_time) : null);
        setEditSeats(trip.user_booking?.seats_booked || 1);
        setEditBigLuggage(trip.user_booking?.big_luggage || 0);
        setEditSmallLuggage(trip.user_booking?.small_luggage || 0);
        setIsEditing(true);
    };

    const cancelEditing = () => {
        setIsEditing(false);
        setPickupError(null);
    };

    const handleSaveBooking = async () => {
        const bookingId = trip.user_booking?.id;
        if (!user || !bookingId) return;

        // Validate pickup location if text entered without selection
        if (pickupLocation && pickupLocation !== pickupLastSelection.current && !pickupCoords) {
            setPickupError(t('tripDetails.rider.editBooking.invalidPickupLocation'));
            return;
        }

        setSaving(true);
        try {
            const token = await user.getIdToken();
            const payload: any = {
                rider_note: editRiderNote || null,
                intended_payment_method: editPaymentMethod,
            };

            // preferred_pickup_time logic
            if (editPreferredPickupTime) {
                payload.preferred_pickup_time = editPreferredPickupTime.toISOString();
            } else {
                payload.preferred_pickup_time = null;
            }

            // Only send location if changed
            if (pickupLocation !== (trip.user_booking?.pickup_location_text || '')) {
                payload.pickup_location_text = pickupLocation || null;
                payload.pickup_lat = pickupCoords?.lat || null;
                payload.pickup_lng = pickupCoords?.lng || null;
            }

            // Seats/Luggage
            const status = trip.user_booking_status || trip.user_booking?.status;
            const canEditSeating = ['waiting_approval', 'joined_with_pay_window', 'pending_pay_confirmation_from_driver'].includes(status);

            if (canEditSeating) {
                if (editSeats !== trip.user_booking?.seats_booked) payload.seats_booked = editSeats;
                if (editBigLuggage !== trip.user_booking?.big_luggage) payload.big_luggage = editBigLuggage;
                if (editSmallLuggage !== trip.user_booking?.small_luggage) payload.small_luggage = editSmallLuggage;
            }

            const res = await fetch(`/api/bookings/${bookingId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || t('tripDetails.rider.editBooking.error'));
            }

            notifications.show({
                title: t('tripDetails.rider.notifications.success.title'),
                message: t('tripDetails.rider.editBooking.success'),
                color: 'green'
            });
            setIsEditing(false);
            onRefresh();
        } catch (error: any) {
            notifications.show({
                title: t('tripDetails.rider.notifications.error.title'),
                message: error.message,
                color: 'red'
            });
        } finally {
            setSaving(false);
        }
    };

    const handleMarkPaymentSent = async () => {
        const bookingId = trip.user_booking?.id;
        if (!user || !bookingId) return;
        setMarkingPaid(true);
        try {
            const token = await user.getIdToken();
            const res = await fetch(`/api/bookings/${bookingId}/pay`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || t('tripDetails.rider.notifications.updateStatusFailed'));
            }

            notifications.show({
                title: t('tripDetails.rider.notifications.success.title'),
                message: t('tripDetails.rider.notifications.markedPaid.message'),
                color: 'green'
            });
            onRefresh();

        } catch (error: any) {
            notifications.show({
                title: t('tripDetails.rider.notifications.error.title'),
                message: error.message,
                color: 'red'
            });
        } finally {
            setMarkingPaid(false);
        }
    };

    const confirmCancelBooking = async () => {
        const bookingId = trip.user_booking?.id;
        if (!user || !bookingId) return;

        setCancelling(true);
        try {
            const token = await user.getIdToken();
            const res = await fetch(`/api/bookings/${bookingId}/leave`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || t('tripDetails.rider.notifications.cancelBookingFailed'));
            }

            const { paid } = await res.json();

            notifications.show({
                title: t('tripDetails.rider.notifications.success.title'),
                message: t('tripDetails.rider.notifications.bookingCancelled.message', { status: paid ? t('tripDetails.status.paid') : t('tripDetails.status.unpaid') }),
                color: 'green'
            });
            onRefresh();
            setCancelModalOpen(false);

        } catch (error: any) {
            notifications.show({
                title: t('tripDetails.rider.notifications.error.title'),
                message: error.message,
                color: 'red'
            });
        } finally {
            setCancelling(false);
        }
    };

    const handleMarkReady = async () => {
        const bookingId = trip.user_booking?.id;
        if (!user || !bookingId) return;
        setMarkingReady(true);
        try {
            const token = await user.getIdToken();
            const res = await fetch(`/api/bookings/${bookingId}/ready`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || t('tripDetails.rider.notifications.updateStatusFailed'));
            }

            notifications.show({
                title: t('tripDetails.rider.notifications.success.title'),
                message: t('tripDetails.rider.notifications.markedReady.message'),
                color: 'green'
            });
            onRefresh();

        } catch (error: any) {
            notifications.show({
                title: t('tripDetails.rider.notifications.error.title'),
                message: error.message,
                color: 'red'
            });
        } finally {
            setMarkingReady(false);
        }
    };

    // Use trip.user_booking_status or falls back to trip.user_booking?.status
    const status = trip.user_booking_status || trip.user_booking?.status;
    const isReadOnly = ['departed', 'done', 'cancelled'].includes(trip.status);
    const showPayButton = status === 'joined_with_pay_window' && !isReadOnly;
    const cond1 = ['waiting_approval', 'joined_with_pay_window', 'pending_pay_confirmation_from_driver', 'confirmed'].includes(status);
    const cond2 = ['bookable', 'locked', 'full'].includes(trip.status);
    const showCancelButton = cond1 && cond2;
    // Readiness Logic
    const isConfirmed = status === 'confirmed';
    const isCheckInStarted = trip.start_check_in;
    const isAlreadyReady = trip.user_booking?.ready;
    const isTripActive = !['done', 'cancelled'].includes(trip.status);
    const canMarkReadyStatuses = ['confirmed', 'pending_pay_confirmation_from_driver'];
    const showReadyButton = canMarkReadyStatuses.includes(status) && isCheckInStarted && !isAlreadyReady && isTripActive;

    const isRemoved = trip.user_booking_status === 'removed' || trip.user_booking_status === 'rejected';

    // Can edit if booking is active and trip is not read-only
    const editableStatuses = ['waiting_approval', 'joined_with_pay_window', 'pending_pay_confirmation_from_driver', 'confirmed'];
    // Strict departed check enforced by API, but good for UI to disable
    const isDeparted = trip.status === 'departed' || trip.status === 'done' || trip.status === 'cancelled' || trip.status === 'aborted';
    const canEdit = editableStatuses.includes(status) && !isReadOnly && !isDeparted;
    const canEditSeating = canEdit && ['waiting_approval', 'joined_with_pay_window', 'pending_pay_confirmation_from_driver'].includes(status);

    const rulesToDisplay = (viewingSnapshot && trip.snapshot_rules) ? trip.snapshot_rules : trip.rules;

    return (
        <>
            <Modal opened={cancelModalOpen} onClose={() => setCancelModalOpen(false)} title={t('tripDetails.rider.modals.leaveTrip.title')} centered>
                <Text size="sm" mb="lg">
                    {t('tripDetails.rider.modals.leaveTrip.description')}
                </Text>
                <Group justify="flex-end">
                    <Button variant="default" onClick={() => setCancelModalOpen(false)} disabled={cancelling}>
                        {t('tripDetails.manage.actions.cancel')}
                    </Button>
                    <Button color="red" onClick={confirmCancelBooking} loading={cancelling}>
                        {t('tripDetails.rider.modals.leaveTrip.confirm')}
                    </Button>
                </Group>
            </Modal>

            <Stack gap="lg" pb={200}>
                <Stack gap={0}>
                    <Title order={2}>
                        {trip.from_text.split(',')[0]} &rarr; {trip.to_text.split(',')[0]}
                    </Title>
                    <Group gap="md" align="center">
                        <Group gap="xs">
                            <IconCalendar size={18} style={{ opacity: 0.7 }} />
                            <Text size="lg" fw={500}>
                                {dayjs(trip.departure_time).format('MMM D, h:mm A')}
                            </Text>
                        </Group>
                        <Badge
                            size="md"
                            color={getTripStatusConfig(trip.status).color}
                        >
                            {t(getTripStatusConfig(trip.status).labelKey).toUpperCase()}
                        </Badge>
                        {trip.status !== "done" && trip.status !== "cancelled" && trip.start_check_in && (
                            <Badge
                                size="md"
                                color="cyan"
                            >
                                {t('dashboard.tripCard.checkInStarted')}
                            </Badge>
                        )}
                    </Group>
                </Stack>
                {isRemoved && (
                    <Alert color="blue" icon={<IconInfoCircle />} title={t('tripDetails.rider.alerts.bookingRemoved.title')}>
                        <Trans
                            i18nKey="tripDetails.rider.alerts.bookingRemoved.description"
                            values={{ reason: trip.user_booking?.removal_reason || t('common.unknown') }}
                        />
                    </Alert>
                )}

                {!isRemoved && (
                    <Alert color="blue" icon={<IconInfoCircle />}>
                        {t('tripDetails.rider.alerts.manageState')}
                    </Alert>
                )}

                {trip.cancelled_paid_booking_within_sensitive_info_grace_period && (
                    <Alert color="red" icon={<IconAlertTriangle />} title={t('tripDetails.rider.alerts.cancelledTrip.title')}>
                        <Trans
                            i18nKey="tripDetails.rider.alerts.cancelledTrip.description"
                            values={{ phone: trip.driver?.phone || t('common.unknown') }}
                            components={{ 1: <Text span fw={700} /> }}
                        />
                    </Alert>
                )}

                <Paper withBorder p="md" radius="md">
                    <Group justify="space-between" mb="md">
                        <Title order={4}>{t('tripDetails.rider.sections.bookingDetails')}</Title>
                        <Group gap="xs">
                            {trip.user_booking?.status && (
                                <Badge
                                    color={getBookingStatusConfig(trip.user_booking.status).color}
                                >
                                    {t(getBookingStatusConfig(trip.user_booking.status).labelKey)}
                                </Badge>
                            )}
                            {canEdit && !isEditing && (
                                <Button
                                    variant="light"
                                    size="xs"
                                    leftSection={<IconEdit size={14} />}
                                    onClick={startEditing}
                                >
                                    {t('tripDetails.rider.editBooking.editButton')}
                                </Button>
                            )}
                            {isEditing && trip.start_check_in && (
                                <Alert color="orange" icon={<IconExclamationCircle />} title={t('tripDetails.rider.editBooking.checkInWarningTitle')}>
                                    {t('tripDetails.rider.editBooking.checkInWarning')}
                                </Alert>
                            )}
                        </Group>
                    </Group>

                    <Stack gap="sm" mb="lg">
                        <SimpleGrid cols={{ base: 1, sm: 2 }}>
                            <InfoItem
                                label={t('tripDetails.rider.labels.bookedAt')}
                                value={trip.user_booking?.created_at ? dayjs(trip.user_booking.created_at).format('MMM D, h:mm A') : '-'}
                            />
                            {isEditing && canEditSeating ? (
                                <Box>
                                    <Text c="dimmed" size="xs" mb={4}>{t('tripDetails.rider.labels.seatsBooked')}</Text>
                                    <NumberInput
                                        value={editSeats}
                                        onChange={(val) => setEditSeats(Number(val))}
                                        min={1}
                                        max={trip.total_seats} // Rough upper bound
                                    />
                                </Box>
                            ) : (
                                <InfoItem
                                    label={t('tripDetails.rider.labels.seatsBooked')}
                                    value={
                                        <Group gap="xs">
                                            <IconArmchair size={16} style={{ opacity: 0.7 }} />
                                            <span>{trip.user_booking?.seats_booked || 0}</span>
                                        </Group>
                                    }
                                />
                            )}

                            {isEditing && canEditSeating ? (
                                <Box>
                                    <Text c="dimmed" size="xs" mb={4}>{t('tripDetails.rider.labels.luggage')}</Text>
                                    <Group grow>
                                        <NumberInput
                                            label={t('dashboard.common.big')}
                                            value={editBigLuggage}
                                            onChange={(val) => setEditBigLuggage(Number(val))}
                                        />
                                        <NumberInput
                                            label={t('dashboard.common.small')}
                                            value={editSmallLuggage}
                                            onChange={(val) => setEditSmallLuggage(Number(val))}
                                        />
                                    </Group>
                                </Box>
                            ) : (
                                <InfoItem
                                    label={t('tripDetails.rider.labels.luggage')}
                                    value={
                                        <Group gap="xs">
                                            <IconLuggage size={16} style={{ opacity: 0.7 }} />
                                            <span>{trip.user_booking?.big_luggage || 0} {t('dashboard.common.big')}, {trip.user_booking?.small_luggage || 0} {t('dashboard.common.small')}</span>
                                        </Group>
                                    }
                                />
                            )}
                            {isEditing ? (
                                <Box>
                                    <Text c="dimmed" size="xs" mb={4}>{t('tripDetails.rider.labels.intendedPayment')}</Text>
                                    <Select
                                        data={rulesToDisplay?.payment?.methods || []}
                                        value={editPaymentMethod}
                                        onChange={(val) => setEditPaymentMethod(val || '')}
                                        placeholder={t('rides.detail.booking.selectPayment')}
                                    />
                                </Box>
                            ) : (
                                <InfoItem
                                    label={t('tripDetails.rider.labels.intendedPayment')}
                                    value={trip.user_booking?.intended_payment_method || t('dashboard.common.none')}
                                />
                            )}
                            <InfoItem
                                label={t('tripDetails.rider.labels.paymentStatus')}
                                value={
                                    trip.user_booking?.paid ?
                                        <Badge color="green" variant="light">{t('tripDetails.status.paid')}</Badge> :
                                        <Badge color="yellow" variant="light">{t('tripDetails.status.unpaid')}</Badge>
                                }
                            />
                            {trip.user_booking?.picked_up_at && (
                                <InfoItem
                                    label={t('tripDetails.rider.labels.pickedUpAt')}
                                    value={
                                        <Group gap="xs">
                                            <IconUserCheck size={16} style={{ opacity: 0.7 }} color="green" />
                                            <span>{dayjs(trip.user_booking.picked_up_at).format('MMM D, h:mm A')}</span>
                                        </Group>
                                    }
                                />
                            )}
                            {(() => {
                                const checkInEnabled = trip.start_check_in;
                                const scheduleHrs = trip.rules?.start_check_in_hrs;
                                const isScheduled = scheduleHrs != null && scheduleHrs !== '';
                                if (!checkInEnabled && !isScheduled) return null;

                                let content;
                                if (checkInEnabled) {
                                    content = (
                                        <Stack gap={2}>
                                            <Group gap="xs">
                                                {trip.user_booking?.ready ? <IconUserCheck size={16} color="green" /> : <IconClock size={16} color="gray" />}
                                                <Text size="sm" fw={500}>{trip.user_booking?.ready ? t('tripDetails.rider.ready') : t('tripDetails.rider.notReady')}</Text>
                                            </Group>
                                            {trip.user_booking?.ready && trip.user_booking?.ready_at && (
                                                <Text size="xs" c="dimmed">{t('dashboard.common.at')} {dayjs(trip.user_booking.ready_at).format('MMM D, h:mm A')}</Text>
                                            )}
                                        </Stack>
                                    );
                                } else {
                                    const hrs = intervalToHours(scheduleHrs);
                                    const startTime = dayjs(trip.departure_time).subtract(hrs, 'hour');
                                    content = (
                                        <Text size="sm" c="dimmed" fs="italic">
                                            {t('tripDetails.rider.values.checkInBegins', { time: startTime.format('MMM D, h:mm A') })}
                                        </Text>
                                    );
                                }

                                return <InfoItem label={t('tripDetails.rider.labels.readyForPickup')} value={content} />;
                            })()}
                            {isEditing ? (
                                <Box>
                                    <Text c="dimmed" size="xs" mb={4}>{t('tripDetails.rider.labels.preferredPickup')}</Text>
                                    <DateTimePicker
                                        value={editPreferredPickupTime}
                                        onChange={(val) => setEditPreferredPickupTime(val ? new Date(val) : null)}
                                        placeholder={t('tripDetails.rider.labels.preferredPickup')}
                                        minDate={new Date()} // Optional: restrict to future? Logic depends on flexibility, but usually not past.
                                        clearable
                                        valueFormat="MM/DD/YYYY HH:mm"
                                        leftSection={<IconCalendar size={16} stroke={1.5} />}
                                    />
                                </Box>
                            ) : (
                                <InfoItem
                                    label={t('tripDetails.rider.labels.preferredPickup')}
                                    value={
                                        trip.user_booking?.preferred_pickup_time ?
                                            dayjs(trip.user_booking.preferred_pickup_time).format('MMM D, h:mm A') :
                                            t('tripDetails.rider.departureTime')
                                    }
                                />
                            )}
                            {isEditing ? (
                                <Box>
                                    <Text c="dimmed" size="xs" mb={4}>{t('tripDetails.rider.labels.pickupLocation')}</Text>
                                    <Autocomplete
                                        data={pickupSuggestions}
                                        value={pickupLocation}
                                        onChange={handlePickupChange}
                                        onOptionSubmit={(val) => {
                                            pickupLastSelection.current = val;
                                            const pid = pickupPredictionsMap.current.get(val);
                                            if (pid) fetchPickupPlaceDetails(pid);
                                        }}
                                        placeholder={t('tripDetails.rider.editBooking.pickupLocationPlaceholder')}
                                        error={pickupError}
                                        rightSection={
                                            loadingPickup ? <Loader size={16} /> :
                                                pickupLocation ? <ActionIcon variant="subtle" size="sm" onClick={clearPickup}><IconX size={14} /></ActionIcon> : null
                                        }
                                    />
                                    {trip.origin?.obfuscated_bounds && (
                                        <Box mt="xs">
                                            <FuzzyRadiusMap
                                                bounds={trip.origin.obfuscated_bounds}
                                                userLocation={pickupCoords || undefined}
                                                type='pickup'
                                            />
                                        </Box>
                                    )}
                                </Box>
                            ) : (
                                <InfoItem
                                    label={t('tripDetails.rider.labels.pickupLocation')}
                                    value={
                                        trip.user_booking?.pickup_location_text ? (
                                            <Group gap="xs">
                                                <IconMapPin size={16} style={{ opacity: 0.7 }} />
                                                <span>{trip.user_booking.pickup_location_text}</span>
                                            </Group>
                                        ) : t('dashboard.common.none')
                                    }
                                />
                            )}
                            {isEditing ? (
                                <Box>
                                    <Text c="dimmed" size="xs" mb={4}>{t('tripDetails.rider.labels.riderNote')}</Text>
                                    <Textarea
                                        value={editRiderNote}
                                        onChange={(e) => setEditRiderNote(e.currentTarget.value)}
                                        placeholder={t('rides.detail.booking.riderNotePlaceholder')}
                                        autosize
                                        minRows={2}
                                    />
                                </Box>
                            ) : (
                                <InfoItem
                                    label={t('tripDetails.rider.labels.riderNote')}
                                    value={
                                        trip.user_booking?.rider_note ? (
                                            <Text size="sm" fs="italic">
                                                {trip.user_booking.rider_note}
                                            </Text>
                                        ) : t('dashboard.common.none')
                                    }
                                />
                            )}
                        </SimpleGrid>
                        {isEditing && (
                            <Group mt="md">
                                <Button
                                    onClick={handleSaveBooking}
                                    loading={saving}
                                >
                                    {t('tripDetails.rider.editBooking.saveButton')}
                                </Button>
                                <Button
                                    variant="subtle"
                                    onClick={cancelEditing}
                                    disabled={saving}
                                >
                                    {t('tripDetails.rider.editBooking.cancelButton')}
                                </Button>
                            </Group>
                        )}
                    </Stack>

                    <Flex gap="xs" direction={{ base: 'column', xs: 'row' }}>
                        {showCancelButton && !isEditing && (
                            <Button
                                variant="subtle"
                                color="red"
                                onClick={() => setCancelModalOpen(true)}
                                loading={cancelling}
                                fullWidth
                            >
                                {t('tripDetails.manage.actions.cancelBooking')}
                            </Button>
                        )}

                        {showPayButton && (
                            <Button
                                color="orange"
                                onClick={handleMarkPaymentSent}
                                loading={markingPaid}
                                leftSection={<IconCash size={16} />}
                                fullWidth
                            >
                                {t('tripDetails.manage.actions.markPaymentSent')}
                            </Button>
                        )}

                        {showReadyButton && (
                            <Button
                                color="green"
                                onClick={handleMarkReady}
                                loading={markingReady}
                                leftSection={<IconUserCheck size={16} />}
                                fullWidth
                            >
                                {t('tripDetails.manage.actions.checkInNow')}
                            </Button>
                        )}
                    </Flex>
                </Paper >

                <Paper withBorder p="md" radius="md">
                    <Group justify="space-between" mb="md">
                        <Title order={4}>{t('tripDetails.rider.sections.tripDetails')}</Title>
                        {trip.snapshot_rules && (
                            <Switch
                                label={t('tripDetails.rider.snapshot.switchLabel')}
                                checked={viewingSnapshot}
                                onChange={(event) => setViewingSnapshot(event.currentTarget.checked)}
                            />
                        )}
                    </Group>
                    {viewingSnapshot && (
                        <Alert color="orange" icon={<IconInfoCircle />} title={t('tripDetails.rider.snapshot.alertTitle')} mb="md">
                            {t('tripDetails.rider.snapshot.alertMessage')}
                        </Alert>
                    )}
                    <Stack gap="lg">
                        <SimpleGrid cols={{ base: 1, sm: 2 }}>
                            <InfoItem
                                label={t('tripDetails.rider.labels.departure')}
                                value={
                                    <Group gap="xs">
                                        <IconCalendar size={16} style={{ opacity: 0.7 }} />
                                        <span>{dayjs(trip.departure_time).format('MMM D, h:mm A')} {formatFlexibility(rulesToDisplay?.time_flexibility || rulesToDisplay?.flexibility)}</span>
                                    </Group>
                                }
                            />
                            <InfoItem
                                label={t('tripDetails.rider.labels.tripStatus')}
                                value={
                                    <Badge variant="light" color={getTripStatusConfig(trip.status).color}>
                                        {t(getTripStatusConfig(trip.status).labelKey).toUpperCase()}
                                    </Badge>
                                }
                            />
                        </SimpleGrid>

                        <SimpleGrid cols={{ base: 1, sm: 2 }}>
                            <InfoItem label={t('tripDetails.rider.labels.cancellationPolicy')} value={rulesToDisplay?.cancellation_policy || t('dashboard.common.standard')} />
                            <InfoItem label={t('tripDetails.rider.labels.pickupInstructions')} value={rulesToDisplay?.pickup?.rules || t('dashboard.common.noneProvided')} />
                        </SimpleGrid>

                        <SimpleGrid cols={{ base: 1, sm: 2 }}>
                            <InfoItem
                                label={t('tripDetails.rider.labels.driverContact')}
                                value={
                                    trip.access?.contact ? (
                                        trip.driver?.phone ? (
                                            <Group gap="xs">
                                                <IconPhone size={16} style={{ opacity: 0.7 }} />
                                                <span>{trip.driver.phone}</span>
                                            </Group>
                                        ) : t('dashboard.common.notProvidedByDriver')
                                    ) : (
                                        <Text size="sm" c="dimmed" fs="italic">
                                            {(() => {
                                                if (!trip.user_booking_status) return t('tripDetails.rider.statusMessages.bookToView');
                                                if (trip.user_booking_status === 'waiting_approval') return t('tripDetails.rider.statusMessages.contactHidden');
                                                if (['removed', 'rejected', 'pay_timeout', 'left_paid', 'left_unpaid'].includes(trip.user_booking_status)) return t('tripDetails.rider.statusMessages.bookingNotActive');
                                                if (['done', 'cancelled', 'aborted'].includes(trip.status)) return t('tripDetails.rider.statusMessages.contactExpired');
                                                return t('tripDetails.rider.statusMessages.bookingNotActive');
                                            })()}
                                        </Text>
                                    )
                                }
                            />
                            <InfoItem
                                label={t('tripDetails.rider.labels.vehicle')}
                                value={
                                    trip.car ? (
                                        <Group gap="xs" align="start">
                                            <IconSteeringWheel size={16} style={{ opacity: 0.7, marginTop: 3 }} />
                                            <Stack gap={2}>
                                                <Text size="sm" fw={500}>{trip.car.color} {trip.car.year} {trip.car.make} {trip.car.model}</Text>

                                                {trip.car?.id ? (
                                                    <Text size="xs" c="dimmed">{t('dashboard.common.plate')}: {trip.car.plate}</Text>
                                                ) : (
                                                    <Text size="xs" c="dimmed" fs="italic">
                                                        {trip.status === 'done' || trip.status === 'cancelled' || trip.status === 'aborted' ? t('tripDetails.status.tripEnded') : t('tripDetails.rider.statusMessages.visibleWhenDeparted')}
                                                    </Text>
                                                )}
                                            </Stack>
                                        </Group>
                                    ) : t('dashboard.common.notAssigned')
                                }
                            />
                        </SimpleGrid>

                        <SimpleGrid cols={{ base: 1, sm: 2 }}>
                            <InfoItem
                                label={t('tripDetails.rider.labels.paymentMethods')}
                                value={
                                    <Group gap="xs">
                                        <IconCreditCard size={16} style={{ opacity: 0.7 }} />
                                        <span>{rulesToDisplay?.payment?.methods?.join(', ') || t('dashboard.common.none')}</span>
                                    </Group>
                                }
                            />
                            <InfoItem
                                label={t('tripDetails.rider.labels.paymentHandle')}
                                value={
                                    trip.access?.financial ? (
                                        rulesToDisplay?.payment?.handle || t('dashboard.common.notProvidedByDriver')
                                    ) : (
                                        <Text size="sm" c="dimmed" fs="italic">
                                            {(() => {
                                                if (!trip.user_booking_status) return t('tripDetails.rider.statusMessages.bookToView');
                                                if (trip.user_booking_status === 'waiting_approval') return t('tripDetails.rider.statusMessages.contactHidden');
                                                if (['removed', 'rejected', 'pay_timeout', 'left_paid', 'left_unpaid'].includes(trip.user_booking_status)) return t('tripDetails.rider.statusMessages.bookingNotActive');
                                                if (['done', 'cancelled', 'aborted'].includes(trip.status)) return t('tripDetails.rider.statusMessages.contactExpired');
                                                return t('tripDetails.rider.statusMessages.bookingNotActive');
                                            })()}
                                        </Text>
                                    )
                                }
                            />
                        </SimpleGrid>

                        <InfoItem
                            label={t('tripDetails.rider.labels.driverNotes')}
                            value={
                                <Group gap="xs" align="start">
                                    <IconNote size={16} style={{ opacity: 0.7, marginTop: 3 }} />
                                    <Text size="sm">{trip.notes || t('dashboard.common.none')}</Text>
                                </Group>
                            }
                        />
                    </Stack>

                    {trip.driver && (
                        <Group mt="xl" pt="md" style={{ borderTop: '1px solid var(--mantine-color-gray-3)' }} justify="space-between">
                            <Group gap="sm">
                                <Avatar src={trip.driver.photo_url} alt={trip.driver.name} radius="xl" size="md" />
                                <Box>
                                    <Text size="sm" fw={500}>{trip.driver.name}</Text>
                                    <Text size="xs" c="dimmed">{t('tripDetails.driver.title')}</Text>
                                </Box>
                            </Group>
                            <Button
                                component="a"
                                href={`/profile/${trip.driver.id}?role=driver`}
                                target="_blank"
                                variant="light"
                                size="xs"
                            >
                                {t('tripDetails.rider.actions.viewProfile')}
                            </Button>
                        </Group>
                    )}
                </Paper>


            </Stack >
        </>
    );
}
