import { useState } from 'react';
import { Card, Text, Group, Stack, Button, Flex, ActionIcon, Tooltip, Badge } from '@mantine/core';
import { getTripStatusConfig, getBookingStatusConfig } from '@/utils/statusUtils';
import { IconMapPin, IconCalendar, IconUserCheck, IconExternalLink, IconCash, IconLuggage } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { LocalizedLink } from '@/components/LocalizedLink';
import { useAuth } from '@/components/firebase/AuthContext';
import { notifications } from '@mantine/notifications';

interface Trip {
    id: string; // trip_id
    id_booking?: string;
    from_text: string;
    to_text: string;
    departure_time: string;
    trip_status: 'bookable' | 'full' | 'departed' | 'done' | 'cancelled' | 'locked';
    booking_status: 'waiting_approval' | 'joined_with_pay_window' | 'pending_pay_confirmation_from_driver' | 'confirmed';
    seats_booked: number;
    price: string;
    booking_id: string;
    big_luggage: number;
    small_luggage: number;
    start_check_in?: boolean;
}

interface RiderTripCardProps {
    trip: Trip;
    onRefresh: () => void;
}

export function RiderTripCard({ trip, onRefresh }: RiderTripCardProps) {
    const { user } = useAuth();
    const [markingPaid, setMarkingPaid] = useState(false);

    const [cancelling, setCancelling] = useState(false);



    const handleMarkPaymentSent = async () => {
        if (!user) return;
        setMarkingPaid(true);
        try {
            const token = await user.getIdToken();
            const res = await fetch(`/api/bookings/${trip.booking_id}/pay`, {
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
        if (!user || !window.confirm('Are you sure you want to cancel this booking?')) return;

        setCancelling(true);
        try {
            const token = await user.getIdToken();
            const res = await fetch(`/api/bookings/${trip.booking_id}/leave`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to cancel booking');
            }

            notifications.show({
                title: 'Success',
                message: 'Booking cancelled (left unpaid).',
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

    const showPayButton = trip.booking_status === 'joined_with_pay_window';
    const showCancelButton = ['waiting_approval', 'joined_with_pay_window'].includes(trip.booking_status);

    return (
        <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Stack gap="md">
                {/* Header: Route and Status */}
                <Flex justify="space-between" align="start" direction={{ base: 'column', sm: 'row' }} gap="xs">
                    <Stack gap={4}>
                        <Group gap="xs">
                            <IconMapPin size={18} style={{ color: 'var(--mantine-color-blue-6)' }} />
                            <Text fw={600} size="lg" lineClamp={1} title={trip.from_text}>
                                {trip.from_text.split(',')[0]}
                            </Text>
                            <Text size="lg" c="dimmed">
                                &rarr;
                            </Text>
                            <Text fw={600} size="lg" lineClamp={1} title={trip.to_text}>
                                {trip.to_text.split(',')[0]}
                            </Text>
                            <Tooltip label="View Public Posting">
                                <ActionIcon
                                    component={LocalizedLink}
                                    href={`/rides/${trip.id}`}
                                    variant="subtle"
                                    color="gray"
                                    size="sm"
                                >
                                    <IconExternalLink size={16} />
                                </ActionIcon>
                            </Tooltip>
                            {trip.start_check_in && trip.trip_status !== 'done' && trip.trip_status !== 'cancelled' && (
                                <Badge size="sm" color="cyan" variant="filled">Check-in Started</Badge>
                            )}
                        </Group>
                        <Text size="xs" c="dimmed" ml={28}>
                            {trip.from_text} &rarr; {trip.to_text}
                        </Text>
                    </Stack>

                    <Flex direction="column" align={{ base: 'flex-start', sm: 'flex-end' }} gap={0}>
                        <Group gap={6}>
                            <Text size="xs" fw={700} c="dimmed">TRIP:</Text>
                            <Text c={getTripStatusConfig(trip.trip_status).color} fw={700} size="sm">
                                {getTripStatusConfig(trip.trip_status).label.toUpperCase()}
                            </Text>

                        </Group>
                        <Group gap={6} align="flex-start">
                            <Text size="xs" fw={700} c="dimmed" style={{ whiteSpace: 'nowrap', marginTop: 1 }}>BOOKING:</Text>
                            <Text
                                c={getBookingStatusConfig(trip.booking_status).color}
                                fw={700}
                                size="sm"
                                ta={{ base: 'left', sm: 'right' }}
                                style={{ lineHeight: 1.3 }}
                            >
                                {getBookingStatusConfig(trip.booking_status).label}
                            </Text>
                        </Group>
                    </Flex>
                </Flex>

                <Card.Section withBorder inheritPadding py="xs">
                    <Group justify="space-between">
                        {/* Date & Time */}
                        <Group gap="xs">
                            <IconCalendar size={16} />
                            <Text size="sm">
                                {dayjs(trip.departure_time).format('MMM D, YYYY h:mm A')}
                            </Text>
                        </Group>

                        {/* Price (if paid/pending) or Seats */}
                        <Group gap="md">
                            <Group gap="xs">
                                <IconUserCheck size={16} />
                                <Text size="sm">
                                    {trip.seats_booked} seat{trip.seats_booked > 1 ? 's' : ''}
                                </Text>
                            </Group>
                            {trip.price && parseFloat(trip.price) > 0 && (
                                <Text size="sm" fw={500}>
                                    ${trip.price} / seat
                                </Text>
                            )}
                        </Group>

                        {/* Luggage */}
                        <Group gap="xs">
                            <IconLuggage size={16} />
                            <Text size="sm">
                                {trip.big_luggage} Big, {trip.small_luggage} Small
                            </Text>
                        </Group>
                    </Group>
                </Card.Section>

                <Flex gap="xs" direction={{ base: 'column', xs: 'row' }}>
                    <Button
                        component={LocalizedLink}
                        href={`/dashboard/${trip.id}`}
                        variant="light"
                        leftSection={<IconUserCheck size={16} />}
                        fullWidth
                    >
                        Manage Booking
                    </Button>

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
            </Stack>
        </Card>
    );
}
