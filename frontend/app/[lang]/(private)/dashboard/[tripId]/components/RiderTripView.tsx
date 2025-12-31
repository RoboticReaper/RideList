import { useState } from 'react';
import { Paper, Title, Text, Group, Stack, Alert, Box, SimpleGrid, Button, Flex } from '@mantine/core';
import { IconAlertTriangle, IconInfoCircle, IconCash, IconUserCheck } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { LocalizedLink } from '@/components/LocalizedLink';
import { notifications } from '@mantine/notifications';
import { useAuth } from '@/components/firebase/AuthContext';

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
        <Text size="sm" fw={500}>{value}</Text>
    </Box>
);

export function RiderTripView({ trip, onRefresh }: RiderTripViewProps) {
    const { user } = useAuth();
    const [markingPaid, setMarkingPaid] = useState(false);
    const [cancelling, setCancelling] = useState(false);

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

    const handleCancelBooking = async () => {
        const bookingId = trip.user_booking?.id;
        if (!user || !bookingId || !window.confirm('Are you sure you want to cancel this booking?')) return;

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

    // Use trip.user_booking_status or falls back to trip.user_booking?.status
    const status = trip.user_booking_status || trip.user_booking?.status;
    const showPayButton = status === 'joined_with_pay_window';
    const cond1 = ['waiting_approval', 'joined_with_pay_window', 'pending_pay_confirmation_from_driver', 'confirmed'].includes(status);
    const cond2 = ['bookable', 'locked', 'full'].includes(trip.status);
    const showCancelButton = cond1 && cond2;
    const isRemoved = trip.user_booking_status === 'removed' || trip.user_booking_status === 'rejected';

    return (
        <Stack gap="lg">
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

            <Paper withBorder p="md" radius="md">
                <Title order={4} mb="md">Booking Actions</Title>
                <Flex gap="xs" direction={{ base: 'column', xs: 'row' }}>

                    {showCancelButton && (
                        <Button
                            variant="subtle"
                            color="red"
                            onClick={handleCancelBooking}
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
                </Flex>
            </Paper>

            <Paper withBorder p="md" radius="md">
                <Title order={4} mb="md">Trip Details</Title>
                <Stack gap="sm">
                    <SimpleGrid cols={2}>
                        <InfoItem
                            label="Departure"
                            value={`${dayjs(trip.departure_time).format('MMM D, h:mm A')} ${formatFlexibility(trip.rules?.time_flexibility)}`}
                        />
                        <InfoItem label="Status" value={trip.status} />
                    </SimpleGrid>

                    <SimpleGrid cols={2}>
                        <InfoItem label="Seats Booked" value={trip.user_booking?.seats_booked || 0} />
                        <InfoItem label="Luggage" value={`${trip.user_booking?.big_luggage || 0} Big, ${trip.user_booking?.small_luggage || 0} Small`} />
                    </SimpleGrid>

                    <SimpleGrid cols={2}>
                        <InfoItem label="Cancellation Policy" value={trip.rules?.cancellation_policy || 'None'} />
                        <InfoItem label="Pickup Instructions" value={trip.rules?.pickup?.rules || 'None'} />
                    </SimpleGrid>

                    <SimpleGrid cols={2}>
                        <InfoItem
                            label="Vehicle"
                            value={trip.car ? `${trip.car.color} ${trip.car.year} ${trip.car.make} ${trip.car.model} ${trip.car.plate ? `(${trip.car.plate})` : ''}` : 'Not assigned'}
                        />
                        <InfoItem label="Driver Contact" value={trip.driver?.phone || 'Driver will provide contacts before departure.'} />
                    </SimpleGrid>

                    <InfoItem label="Driver's Notes" value={trip.notes || 'None'} />
                </Stack>
            </Paper>

            {isRemoved && (
                <Paper withBorder p="md" radius="md">
                    <Title order={4} mb="md">Booking Record</Title>
                    <Stack gap="sm">
                        <SimpleGrid cols={3}>
                            <InfoItem label="Seats" value={trip.user_booking?.seats_booked || 0} />
                            <InfoItem label="Big Luggage" value={trip.user_booking?.big_luggage || 0} />
                            <InfoItem label="Small Luggage" value={trip.user_booking?.small_luggage || 0} />
                        </SimpleGrid>
                        <SimpleGrid cols={3}>
                            <InfoItem label="Paid" value={trip.user_booking?.paid ? 'Yes' : 'No'} />
                            <InfoItem label="Ready For Pickup" value={trip.user_booking?.ready ? 'Yes' : 'No'} />
                            <InfoItem
                                label="Ready At"
                                value={trip.user_booking?.ready_at ? dayjs(trip.user_booking.ready_at).format('MMM D, h:mm A') : '-'}
                            />
                        </SimpleGrid>
                        <SimpleGrid cols={3}>
                            <InfoItem
                                label="Preferred Pickup Time"
                                value={trip.user_booking?.preferred_pickup_time ? dayjs(trip.user_booking.preferred_pickup_time).format('h:mm A') : 'None'}
                            />
                            <InfoItem
                                label="Removed At"
                                value={trip.user_booking?.removed_at ? dayjs(trip.user_booking.removed_at).format('MMM D, h:mm A') : '-'}
                            />
                        </SimpleGrid>
                    </Stack>
                </Paper>
            )}
        </Stack>
    );
}
