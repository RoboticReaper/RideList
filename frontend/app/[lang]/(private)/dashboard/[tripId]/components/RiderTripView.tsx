import { Paper, Title, Text, Group, Stack, TextInput, NumberInput, Button, Alert } from '@mantine/core';
import { IconAlertTriangle, IconInfoCircle } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { LocalizedLink } from '@/components/LocalizedLink';

interface RiderTripViewProps {
    trip: any; // Using any for now to match parent prop flexibility, ideally generic type of Trip
}

export function RiderTripView({ trip }: RiderTripViewProps) {
    const isRemoved = trip.user_booking_status === 'removed' || trip.user_booking_status === 'rejected';

    return (
        <Stack gap="lg">
            {isRemoved && (
                <Alert color="blue" icon={<IconInfoCircle />} title="Booking removed">
                    The driver is unable to accomodate you. You can re-book this trip but it will require driver manual approval.
                </Alert>
            )}

            {!isRemoved && (
                <Alert color="blue" icon={<IconInfoCircle />}>
                    Manage your booking via the public page or contact driver directly.
                </Alert>
            )}

            <Paper withBorder p="md" radius="md">
                <Title order={4} mb="md">Booking Actions</Title>
                <Text size="sm" c="dimmed">Use the 'View Public Posting' button above to manage booking details.</Text>
            </Paper>

            {isRemoved && (
                <Paper withBorder p="md" radius="md">
                    <Title order={4} mb="md">Booking Record</Title>
                    <Stack gap="sm">
                        <Group grow>
                            <TextInput label="Seats" value={trip.user_booking?.seats_booked || 0} readOnly />
                            <TextInput label="Big Luggage" value={trip.user_booking?.big_luggage || 0} readOnly />
                            <TextInput label="Small Luggage" value={trip.user_booking?.small_luggage || 0} readOnly />
                        </Group>
                        <Group grow>
                            <TextInput label="Paid" value={trip.user_booking?.paid ? 'Yes' : 'No'} readOnly />
                            <TextInput label="Ready For Pickup" value={trip.user_booking?.ready ? 'Yes' : 'No'} readOnly />
                            <TextInput
                                label="Ready At"
                                value={trip.user_booking?.ready_at ? dayjs(trip.user_booking.ready_at).format('MMM D, h:mm A') : '-'}
                                readOnly
                            />
                        </Group>
                        <Group grow>
                            <TextInput
                                label="Preferred Pickup Time"
                                value={trip.user_booking?.preferred_pickup_time ? dayjs(trip.user_booking.preferred_pickup_time).format('h:mm A') : 'None'}
                                readOnly
                            />
                            <TextInput
                                label="Removed At"
                                value={trip.user_booking?.removed_at ? dayjs(trip.user_booking.removed_at).format('MMM D, h:mm A') : '-'}
                                readOnly
                            />
                        </Group>
                    </Stack>
                </Paper>
            )}
        </Stack>
    );
}
