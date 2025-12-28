import { useEffect, useState } from 'react';
import { Table, Avatar, Text, Group, Badge, Loader, Stack, Alert } from '@mantine/core';
import { useAuth } from '@/components/firebase/AuthContext';
import { IconInfoCircle } from '@tabler/icons-react';
import dayjs from 'dayjs';

interface Booking {
    id: string;
    seats_booked: number;
    big_luggage: number;
    small_luggage: number;
    status: string;
    created_at: string;
    rider_name: string;
    rider_photo_url: string | null;
    rider_rating: number | null;
    rider_completed_rides: number;
}

interface ManageTripViewProps {
    tripId: string;
}

export function ManageTripView({ tripId }: ManageTripViewProps) {
    const { user } = useAuth();
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!user) return;

        const fetchBookings = async () => {
            try {
                const token = await user.getIdToken();
                const res = await fetch(`/api/trips/${tripId}/bookings`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (!res.ok) throw new Error('Failed to fetch bookings');
                const data = await res.json();
                setBookings(data.bookings || []);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchBookings();
    }, [user, tripId]);

    if (loading) return <Loader />;
    if (error) return <Alert color="red" title="Error">{error}</Alert>;

    if (bookings.length === 0) {
        return (
            <Alert icon={<IconInfoCircle size={16} />} title="No Bookings" color="blue">
                No one has booked this trip yet.
            </Alert>
        );
    }

    const rows = bookings.map((b) => (
        <Table.Tr key={b.id}>
            <Table.Td>
                <Group gap="sm">
                    <Avatar src={b.rider_photo_url} radius="xl" />
                    <div>
                        <Text size="sm" fw={500}>{b.rider_name}</Text>
                        <Text size="xs" c="dimmed">
                            {b.rider_rating ? `★ ${b.rider_rating.toFixed(1)}` : 'New Rider'} • {b.rider_completed_rides} rides
                        </Text>
                    </div>
                </Group>
            </Table.Td>
            <Table.Td>
                <Badge
                    color={
                        b.status === 'confirmed' ? 'green' :
                            b.status === 'waiting_approval' ? 'yellow' :
                                'gray'
                    }
                >
                    {b.status.replace('_', ' ')}
                </Badge>
            </Table.Td>
            <Table.Td>{b.seats_booked}</Table.Td>
            <Table.Td>
                {b.big_luggage > 0 && <Badge variant="outline" size="sm" mr={4}>{b.big_luggage} Big</Badge>}
                {b.small_luggage > 0 && <Badge variant="outline" size="sm">{b.small_luggage} Small</Badge>}
                {b.big_luggage === 0 && b.small_luggage === 0 && <Text size="sm" c="dimmed">-</Text>}
            </Table.Td>
            <Table.Td>
                <Text size="sm" c="dimmed">{dayjs(b.created_at).format('MMM D, h:mm A')}</Text>
            </Table.Td>
        </Table.Tr>
    ));

    return (
        <Stack>
            <Text size="sm" c="dimmed">{bookings.length} Booking{bookings.length !== 1 ? 's' : ''}</Text>
            <Table>
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th>Rider</Table.Th>
                        <Table.Th>Status</Table.Th>
                        <Table.Th>Seats</Table.Th>
                        <Table.Th>Luggage</Table.Th>
                        <Table.Th>Booked At</Table.Th>
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>{rows}</Table.Tbody>
            </Table>
        </Stack>
    );
}
