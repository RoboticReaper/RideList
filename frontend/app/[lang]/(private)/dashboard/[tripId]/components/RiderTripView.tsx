import { useState } from 'react';
import { Paper, Title, Text, Group, Stack, Alert, Box, SimpleGrid, Button, Flex, Badge, Modal, Switch } from '@mantine/core';
import { IconAlertTriangle, IconInfoCircle, IconCash, IconUserCheck, IconCalendar, IconLuggage, IconArmchair, IconClock, IconCreditCard, IconSteeringWheel, IconPhone, IconNote, IconMapPin } from '@tabler/icons-react';
import dayjs from 'dayjs';
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
                throw new Error(err.error || 'Failed to update status');
            }

            notifications.show({
                title: 'Success',
                message: 'Marked as paid. Waiting for driver confirmation.',
                color: 'green'
            });
            onRefresh();

        } catch (error: any) {
            notifications.show({
                title: 'Error',
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
                throw new Error(err.error || 'Failed to cancel booking');
            }

            const { paid } = await res.json();

            notifications.show({
                title: 'Success',
                message: 'Booking cancelled (left ' + (paid ? 'paid' : 'unpaid') + ')',
                color: 'green'
            });
            onRefresh();
            setCancelModalOpen(false);

        } catch (error: any) {
            notifications.show({
                title: 'Error',
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
                throw new Error(err.error || 'Failed to update status');
            }

            notifications.show({
                title: 'Success',
                message: 'You are now marked as ready!',
                color: 'green'
            });
            onRefresh();

        } catch (error: any) {
            notifications.show({
                title: 'Error',
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
            <Modal opened={cancelModalOpen} onClose={() => setCancelModalOpen(false)} title="Leave Trip" centered>
                <Text size="sm" mb="lg">
                    Are you sure you want to cancel this booking? This action cannot be undone.
                </Text>
                <Group justify="flex-end">
                    <Button variant="default" onClick={() => setCancelModalOpen(false)} disabled={cancelling}>
                        Cancel
                    </Button>
                    <Button color="red" onClick={confirmCancelBooking} loading={cancelling}>
                        Confirm
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
                            {getTripStatusConfig(trip.status).label.toUpperCase()}
                        </Badge>
                        {trip.status !== "done" && trip.status !== "cancelled" && trip.start_check_in && (
                            <Badge
                                size="md"
                                color="cyan"
                            >
                                Check-in Started
                            </Badge>
                        )}
                    </Group>
                </Stack>
                {isRemoved && (
                    <Alert color="blue" icon={<IconInfoCircle />} title="Booking removed">
                        The driver is unable to accomodate you. {trip.driver?.phone ? `Please contact the driver at ${trip.driver.phone} for refund. ` : ''} You can re-book this trip but it will require driver manual approval.
                    </Alert>
                )}

                {!isRemoved && (
                    <Alert color="blue" icon={<IconInfoCircle />}>
                        Manage your booking state here or view public posting for more details. Contact the driver for any questions.
                    </Alert>
                )}

                {trip.cancelled_paid_booking_within_sensitive_info_grace_period && (
                    <Alert color="red" icon={<IconAlertTriangle />} title="Trip Cancelled/Aborted">
                        This trip was cancelled or aborted. Since you have already paid, please contact the driver at <Text span fw={700}>{trip.driver?.phone || 'Unknown'}</Text> for a refund.
                    </Alert>
                )}

                <Paper withBorder p="md" radius="md">
                    <Group justify="space-between" mb="md">
                        <Title order={4}>Booking Details</Title>
                        {trip.user_booking?.status && (
                            <Badge
                                color={getBookingStatusConfig(trip.user_booking.status).color}
                            >
                                {getBookingStatusConfig(trip.user_booking.status).label}
                            </Badge>
                        )}
                    </Group>

                    <Stack gap="sm" mb="lg">
                        <SimpleGrid cols={{ base: 1, sm: 2 }}>
                            <InfoItem
                                label="Booked At"
                                value={trip.user_booking?.created_at ? dayjs(trip.user_booking.created_at).format('MMM D, h:mm A') : '-'}
                            />
                            <InfoItem
                                label="Seats Booked"
                                value={
                                    <Group gap="xs">
                                        <IconArmchair size={16} style={{ opacity: 0.7 }} />
                                        <span>{trip.user_booking?.seats_booked || 0}</span>
                                    </Group>
                                }
                            />
                            <InfoItem
                                label="Luggage"
                                value={
                                    <Group gap="xs">
                                        <IconLuggage size={16} style={{ opacity: 0.7 }} />
                                        <span>{trip.user_booking?.big_luggage || 0} Big, {trip.user_booking?.small_luggage || 0} Small</span>
                                    </Group>
                                }
                            />
                            <InfoItem
                                label="Intended Payment Method"
                                value={trip.user_booking?.intended_payment_method || 'None'}
                            />
                            <InfoItem
                                label="Payment Status (Confirmed by Driver)"
                                value={
                                    trip.user_booking?.paid ?
                                        <Badge color="green" variant="light">Paid</Badge> :
                                        <Badge color="yellow" variant="light">Unpaid</Badge>
                                }
                            />
                            {trip.user_booking?.picked_up_at && (
                                <InfoItem
                                    label="Picked Up At"
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
                                                <Text size="sm" fw={500}>{trip.user_booking?.ready ? 'Ready' : 'Not marked ready'}</Text>
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

                                return <InfoItem label="Ready For Pickup" value={content} />;
                            })()}
                            <InfoItem
                                label="Preferred Pickup"
                                value={
                                    trip.user_booking?.preferred_pickup_time ?
                                        dayjs(trip.user_booking.created_at).format('MMM D, h:mm A') :
                                        'Departure Time'
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
                                Cancel Booking
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
                                Mark Payment Sent
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
                                Check-in Now
                            </Button>
                        )}
                    </Flex>
                </Paper>

                <Paper withBorder p="md" radius="md">
                    <Group justify="space-between" mb="md">
                        <Title order={4}>Trip Details</Title>
                        {trip.snapshot_rules && (
                            <Switch
                                label="View Booking Snapshot"
                                checked={viewingSnapshot}
                                onChange={(event) => setViewingSnapshot(event.currentTarget.checked)}
                            />
                        )}
                    </Group>
                    {viewingSnapshot && (
                        <Alert color="orange" icon={<IconInfoCircle />} title="Viewing Booked Rules" mb="md">
                            You are viewing the trip rules as they were when you booked.
                        </Alert>
                    )}
                    <Stack gap="lg">
                        <SimpleGrid cols={{ base: 1, sm: 2 }}>
                            <InfoItem
                                label="Departure"
                                value={
                                    <Group gap="xs">
                                        <IconCalendar size={16} style={{ opacity: 0.7 }} />
                                        <span>{dayjs(trip.departure_time).format('MMM D, h:mm A')} {formatFlexibility(rulesToDisplay?.time_flexibility || rulesToDisplay?.flexibility)}</span>
                                    </Group>
                                }
                            />
                            <InfoItem
                                label="Trip Status"
                                value={
                                    <Badge variant="light" color={getTripStatusConfig(trip.status).color}>
                                        {getTripStatusConfig(trip.status).label.toUpperCase()}
                                    </Badge>
                                }
                            />
                        </SimpleGrid>

                        <SimpleGrid cols={{ base: 1, sm: 2 }}>
                            <InfoItem label="Cancellation Policy" value={rulesToDisplay?.cancellation_policy || 'Standard'} />
                            <InfoItem label="Pickup Instructions" value={rulesToDisplay?.pickup?.rules || 'None provided'} />
                        </SimpleGrid>

                        <SimpleGrid cols={{ base: 1, sm: 2 }}>
                            <InfoItem
                                label="Driver Contact"
                                value={
                                    trip.sensitive_info_access ? (
                                        trip.driver?.phone ? (
                                            <Group gap="xs">
                                                <IconPhone size={16} style={{ opacity: 0.7 }} />
                                                <span>{trip.driver.phone}</span>
                                            </Group>
                                        ) : 'Contacts available before departure'
                                    ) : (
                                        <Text size="sm" c="dimmed" fs="italic">Hidden until booking accepted by driver or due to booking no longer active</Text>
                                    )
                                }
                            />
                            <InfoItem
                                label="Vehicle"
                                value={
                                    trip.car ? (
                                        <Group gap="xs" align="start">
                                            <IconSteeringWheel size={16} style={{ opacity: 0.7, marginTop: 3 }} />
                                            <Stack gap={0}>
                                                <Text size="sm" fw={500}>{trip.car.color} {trip.car.year} {trip.car.make} {trip.car.model}</Text>
                                                {trip.sensitive_info_access ? (
                                                    trip.car.plate && <Text size="xs" c="dimmed">Plate: {trip.car.plate}</Text>
                                                ) : (
                                                    <Text size="xs" c="dimmed" fs="italic">Plate hidden</Text>
                                                )}
                                            </Stack>
                                        </Group>
                                    ) : 'Not assigned'
                                }
                            />
                        </SimpleGrid>

                        <SimpleGrid cols={{ base: 1, sm: 2 }}>
                            <InfoItem
                                label="Payment Methods"
                                value={
                                    <Group gap="xs">
                                        <IconCreditCard size={16} style={{ opacity: 0.7 }} />
                                        <span>{rulesToDisplay?.payment?.methods?.join(', ') || 'None'}</span>
                                    </Group>
                                }
                            />
                            <InfoItem
                                label="Payment Handle"
                                value={
                                    trip.sensitive_info_access ? (
                                        rulesToDisplay?.payment?.handle || 'Ask driver'
                                    ) : (
                                        <Text size="sm" c="dimmed" fs="italic">Hidden until booking accepted by driver or due to booking no longer active</Text>
                                    )
                                }
                            />
                        </SimpleGrid>

                        <InfoItem
                            label="Driver's Notes"
                            value={
                                <Group gap="xs" align="start">
                                    <IconNote size={16} style={{ opacity: 0.7, marginTop: 3 }} />
                                    <Text size="sm">{trip.notes || 'None'}</Text>
                                </Group>
                            }
                        />
                    </Stack>
                </Paper>


            </Stack>
        </>
    );
}
