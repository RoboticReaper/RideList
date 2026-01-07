import { useState } from 'react';
import { Paper, Title, Text, Group, Stack, Alert, Box, SimpleGrid, Button, Flex, Badge, Modal, Switch } from '@mantine/core';
import { IconAlertTriangle, IconInfoCircle, IconCash, IconUserCheck, IconCalendar, IconLuggage, IconArmchair, IconClock, IconCreditCard, IconSteeringWheel, IconPhone, IconNote, IconMapPin } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useTranslation, Trans } from 'react-i18next';
import { LocalizedLink } from '@/components/LocalizedLink';
import { notifications } from '@mantine/notifications';
import { useAuth } from '@/components/firebase/AuthContext';
import { intervalToHours } from '@/utils/intervalParsers';
import { getTripStatusConfig, getBookingStatusConfig } from '@/utils/statusUtils';

interface RiderTripViewProps {
    trip: any; // Using any for now to match parent prop flexibility, ideally generic type of Trip
    onRefresh: () => void;
}

function formatFlexibility(interval: any) {
    if (!interval) return '';
    if (typeof interval === 'string') return `(+/- ${interval})`;
    if (typeof interval === 'number') return `(+/- ${interval}h)`;

    // Postgres Interval object
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
                            values={{ phone: trip.driver?.phone }}
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
                            values={{ phone: trip.driver?.phone || 'Unknown' }}
                            components={{ 1: <Text span fw={700} /> }}
                        />
                    </Alert>
                )}

                <Paper withBorder p="md" radius="md">
                    <Group justify="space-between" mb="md">
                        <Title order={4}>{t('tripDetails.rider.sections.bookingDetails')}</Title>
                        {trip.user_booking?.status && (
                            <Badge
                                color={getBookingStatusConfig(trip.user_booking.status).color}
                            >
                                {t(getBookingStatusConfig(trip.user_booking.status).labelKey)}
                            </Badge>
                        )}
                    </Group>

                    <Stack gap="sm" mb="lg">
                        <SimpleGrid cols={{ base: 1, sm: 2 }}>
                            <InfoItem
                                label={t('tripDetails.rider.labels.bookedAt')}
                                value={trip.user_booking?.created_at ? dayjs(trip.user_booking.created_at).format('MMM D, h:mm A') : '-'}
                            />
                            <InfoItem
                                label={t('tripDetails.rider.labels.seatsBooked')}
                                value={
                                    <Group gap="xs">
                                        <IconArmchair size={16} style={{ opacity: 0.7 }} />
                                        <span>{trip.user_booking?.seats_booked || 0}</span>
                                    </Group>
                                }
                            />
                            <InfoItem
                                label={t('tripDetails.rider.labels.luggage')}
                                value={
                                    <Group gap="xs">
                                        <IconLuggage size={16} style={{ opacity: 0.7 }} />
                                        <span>{trip.user_booking?.big_luggage || 0} {t('dashboard.common.big')}, {trip.user_booking?.small_luggage || 0} {t('dashboard.common.small')}</span>
                                    </Group>
                                }
                            />
                            <InfoItem
                                label={t('tripDetails.rider.labels.intendedPayment')}
                                value={trip.user_booking?.intended_payment_method || t('dashboard.common.none')}
                            />
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
                                                <Text size="xs" c="dimmed">at {dayjs(trip.user_booking.ready_at).format('MMM D, h:mm A')}</Text>
                                            )}
                                        </Stack>
                                    );
                                } else {
                                    // Scheduled but not started
                                    const hrs = intervalToHours(scheduleHrs);
                                    const startTime = dayjs(trip.departure_time).subtract(hrs, 'hour');
                                    content = (
                                        <Text size="sm" c="dimmed" fs="italic">
                                            Check-in begins {startTime.format('MMM D, h:mm A')}
                                        </Text>
                                    );
                                }

                                return <InfoItem label={t('tripDetails.rider.labels.readyForPickup')} value={content} />;
                            })()}
                            <InfoItem
                                label={t('tripDetails.rider.labels.preferredPickup')}
                                value={
                                    trip.user_booking?.preferred_pickup_time ?
                                        dayjs(trip.user_booking.created_at).format('MMM D, h:mm A') :
                                        t('tripDetails.rider.departureTime')
                                }
                            />
                        </SimpleGrid>
                    </Stack>

                    <Flex gap="xs" direction={{ base: 'column', xs: 'row' }}>
                        {showCancelButton && (
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
                </Paper>

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
                                            <Stack gap={0}>
                                                <Text size="sm" fw={500}>{trip.car.color} {trip.car.year} {trip.car.make} {trip.car.model}</Text>
                                                {trip.car.plate ? (
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
                                    trip.access?.contact ? (
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
                </Paper>


            </Stack>
        </>
    );
}
