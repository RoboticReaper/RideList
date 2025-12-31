import { useEffect, useState, useCallback } from 'react';
import { Table, Avatar, Text, Group, Badge, Loader, Stack, Alert, Button, ActionIcon, Tooltip, Modal, Select, Textarea, Collapse, UnstyledButton } from '@mantine/core';
import { useAuth } from '@/components/firebase/AuthContext';
import { IconInfoCircle, IconCheck, IconX, IconTrash, IconCurrencyDollar, IconChevronRight, IconChevronDown } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { notifications } from '@mantine/notifications';

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
    tripStatus: string;
    onStatusChange: () => void;
    lastRefreshed?: Date;
}

const PRE_PAYMENT_REASONS = [
    { value: 'Luggage requirements not met', label: 'Did not meet luggage requirements' },
    { value: 'Pickup mismatch', label: 'Pickup expectations did not match trip rules' },
    { value: 'No response', label: 'Did not respond / confirm in time' },
    { value: 'Mistake booking', label: 'Joined by mistake / duplicate booking' },
    { value: 'Driver mistake', label: 'Driver mistake (removed unintentionally)' },
    { value: 'Other (pre-payment)', label: 'Other (requires short note)' }
];

const POST_PAYMENT_REASONS = [
    { value: 'Violated rules', label: 'Violated trip rules after booking' },
    { value: 'Late cancellation', label: 'Late cancellation after payment window' },
    { value: 'No-show', label: 'No-show / unresponsive after payment' },
    { value: 'Payment issue', label: 'Payment issue (invalid / reversed / disputed)' },
    { value: 'Other (post-payment)', label: 'Other (requires note)' }
];

const INACTIVE_STATUSES = ['pay_timeout', 'removed', 'left_paid', 'left_unpaid', 'cancelled'];

function RemoveRiderModal({ booking, onClose, onConfirm, loading }: { booking: Booking | null, onClose: () => void, onConfirm: (reason: string) => void, loading: boolean }) {
    const [reason, setReason] = useState<string | null>(null);
    const [note, setNote] = useState('');

    useEffect(() => {
        setReason(null);
        setNote('');
    }, [booking]);

    if (!booking) return null;

    const isPrePayment = booking.status === 'waiting_approval' || booking.status === 'joined_with_pay_window';
    const reasons = isPrePayment ? PRE_PAYMENT_REASONS : POST_PAYMENT_REASONS;
    const isOther = reason?.toLowerCase().includes('other');

    const handleSubmit = () => {
        if (!reason) return;
        let finalReason = reason;
        if (isOther) {
            finalReason = `${reason}: ${note}`;
        }
        onConfirm(finalReason);
    };

    return (
        <Modal opened={!!booking} onClose={onClose} title="Remove Rider">
            <Stack>
                <Text size="sm">
                    Please select a reason for removing <b>{booking.rider_name}</b>.
                </Text>

                <Select
                    label="Reason"
                    placeholder="Select a reason"
                    data={reasons}
                    value={reason}
                    onChange={setReason}
                    allowDeselect={false}
                />

                {isOther && (
                    <Textarea
                        label="Note"
                        placeholder="Please provide a short explanation"
                        value={note}
                        onChange={(event) => setNote(event.currentTarget.value)}
                        minRows={3}
                        required
                    />
                )}

                <Group justify="flex-end" mt="md">
                    <Button variant="default" onClick={onClose} disabled={loading}>Cancel</Button>
                    <Button
                        color="red"
                        onClick={handleSubmit}
                        loading={loading}
                        disabled={!reason || (isOther && !note.trim())}
                    >
                        Remove Rider
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
}

export function ManageTripView({ tripId, tripStatus, onStatusChange, lastRefreshed }: ManageTripViewProps) {
    const { user } = useAuth();
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [inactiveOpen, setInactiveOpen] = useState(false);

    // Removal Modal State
    const [riderToRemove, setRiderToRemove] = useState<Booking | null>(null);

    // Cancel Trip Modal
    const [cancelModalOpen, setCancelModalOpen] = useState(false);
    const [statusLoading, setStatusLoading] = useState(false);

    const [columnWidths, setColumnWidths] = useState({
        rider: 150,
        status: 150,
        seats: 80,
        luggage: 80,
        createdAt: 100,
        actions: 150
    });

    const handleResizeStart = (e: React.PointerEvent<HTMLDivElement>, column: keyof typeof columnWidths) => {
        e.preventDefault();
        e.stopPropagation();

        const resizer = e.currentTarget;
        const startX = e.clientX;
        const startWidth = columnWidths[column];
        resizer.setPointerCapture(e.pointerId);

        const handlePointerMove = (moveEvent: PointerEvent) => {
            if (moveEvent.pointerId !== e.pointerId) return;
            const diff = moveEvent.clientX - startX;
            setColumnWidths(prev => ({
                ...prev,
                [column]: Math.max(50, startWidth + diff) // Minimum width 50px
            }));
        };

        const handlePointerUp = (upEvent: PointerEvent) => {
            if (upEvent.pointerId !== e.pointerId) return;
            resizer.removeEventListener('pointermove', handlePointerMove as any);
            resizer.removeEventListener('pointerup', handlePointerUp as any);
            resizer.removeEventListener('pointercancel', handlePointerUp as any);
            resizer.releasePointerCapture(upEvent.pointerId);
        };

        resizer.addEventListener('pointermove', handlePointerMove as any);
        resizer.addEventListener('pointerup', handlePointerUp as any);
        resizer.addEventListener('pointercancel', handlePointerUp as any);
    };

    const fetchBookings = useCallback(async () => {
        try {
            if (!user) return;
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
    }, [user, tripId]);

    useEffect(() => {
        fetchBookings();
    }, [fetchBookings, lastRefreshed]);

    const handleAction = async (bookingId: string, action: string, reason?: string) => {
        if (!user) return;
        setActionLoading(bookingId);
        try {
            const token = await user.getIdToken();
            const res = await fetch(`/api/bookings/${bookingId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ action, reason })
            });

            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Action failed');

            if (action === 'remove') {
                notifications.show({
                    title: 'Success',
                    message: 'Rider removed. They will require your manual accept if they want to join again.',
                    color: 'green',
                    autoClose: 5000
                });
            } else {
                notifications.show({
                    title: 'Success',
                    message: `Booking updated successfully`,
                    color: 'green'
                });
            }

            // Close modal if open
            setRiderToRemove(null);

            // Refresh list
            await fetchBookings();

        } catch (err: any) {
            notifications.show({
                title: 'Error',
                message: err.message,
                color: 'red'
            });
        } finally {
            setActionLoading(null);
        }
    };

    const handleConfirmRemoval = (reason: string) => {
        if (riderToRemove) {
            handleAction(riderToRemove.id, 'remove', reason);
        }
    };

    const handleStatusUpdate = async (newStatus: 'departed' | 'cancelled') => {
        if (!user) return;
        setStatusLoading(true);
        try {
            const token = await user.getIdToken();
            const res = await fetch(`/api/trips/${tripId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ status: newStatus })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to update status');

            notifications.show({
                title: 'Success',
                message: `Trip marked as ${newStatus}`,
                color: 'green'
            });

            if (newStatus === 'cancelled') {
                setCancelModalOpen(false);
            }

            onStatusChange();

        } catch (err: any) {
            notifications.show({
                title: 'Error',
                message: err.message,
                color: 'red'
            });
        } finally {
            setStatusLoading(false);
        }
    };

    if (loading) return <Loader />;
    if (error) return <Alert color="red" title="Error">{error}</Alert>;


    const activeBookings = bookings.filter(b => !INACTIVE_STATUSES.includes(b.status));
    const inactiveBookings = bookings.filter(b => INACTIVE_STATUSES.includes(b.status));

    const renderHeader = () => (
        <Table.Thead>
            <Table.Tr>
                <Table.Th style={{ width: columnWidths.rider, position: 'relative', whiteSpace: 'normal', overflowWrap: 'break-word' }}>
                    Rider
                    <div
                        style={{
                            position: 'absolute',
                            top: 0,
                            right: 0,
                            width: '30px',
                            height: '100%',
                            cursor: 'col-resize',
                            userSelect: 'none',
                            touchAction: 'none',
                            zIndex: 1,
                            display: 'flex',
                            justifyContent: 'flex-end'
                        }}
                        onPointerDown={(e) => handleResizeStart(e, 'rider')}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div style={{ width: '1px', height: '100%', backgroundColor: 'var(--mantine-color-gray-4)' }} />
                    </div>
                </Table.Th>
                <Table.Th style={{ width: columnWidths.status, position: 'relative', whiteSpace: 'normal', overflowWrap: 'break-word' }}>
                    Status
                    <div
                        style={{
                            position: 'absolute',
                            top: 0,
                            right: 0,
                            width: '30px',
                            height: '100%',
                            cursor: 'col-resize',
                            userSelect: 'none',
                            touchAction: 'none',
                            zIndex: 1,
                            display: 'flex',
                            justifyContent: 'flex-end'
                        }}
                        onPointerDown={(e) => handleResizeStart(e, 'status')}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div style={{ width: '1px', height: '100%', backgroundColor: 'var(--mantine-color-gray-4)' }} />
                    </div>
                </Table.Th>
                <Table.Th style={{ width: columnWidths.seats, position: 'relative', whiteSpace: 'normal', overflowWrap: 'break-word' }}>
                    Seats
                    <div
                        style={{
                            position: 'absolute',
                            top: 0,
                            right: 0,
                            width: '30px',
                            height: '100%',
                            cursor: 'col-resize',
                            userSelect: 'none',
                            touchAction: 'none',
                            zIndex: 1,
                            display: 'flex',
                            justifyContent: 'flex-end'
                        }}
                        onPointerDown={(e) => handleResizeStart(e, 'seats')}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div style={{ width: '1px', height: '100%', backgroundColor: 'var(--mantine-color-gray-4)' }} />
                    </div>
                </Table.Th>
                <Table.Th style={{ width: columnWidths.luggage, position: 'relative', whiteSpace: 'normal', overflowWrap: 'break-word' }}>
                    Luggage
                    <div
                        style={{
                            position: 'absolute',
                            top: 0,
                            right: 0,
                            width: '30px',
                            height: '100%',
                            cursor: 'col-resize',
                            userSelect: 'none',
                            touchAction: 'none',
                            zIndex: 1,
                            display: 'flex',
                            justifyContent: 'flex-end'
                        }}
                        onPointerDown={(e) => handleResizeStart(e, 'luggage')}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div style={{ width: '1px', height: '100%', backgroundColor: 'var(--mantine-color-gray-4)' }} />
                    </div>
                </Table.Th>
                <Table.Th style={{ width: columnWidths.createdAt, position: 'relative', whiteSpace: 'normal', overflowWrap: 'break-word' }}>
                    Booked At
                    <div
                        style={{
                            position: 'absolute',
                            top: 0,
                            right: 0,
                            width: '30px',
                            height: '100%',
                            cursor: 'col-resize',
                            userSelect: 'none',
                            touchAction: 'none',
                            zIndex: 1,
                            display: 'flex',
                            justifyContent: 'flex-end'
                        }}
                        onPointerDown={(e) => handleResizeStart(e, 'createdAt')}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div style={{ width: '1px', height: '100%', backgroundColor: 'var(--mantine-color-gray-4)' }} />
                    </div>
                </Table.Th>
                <Table.Th style={{ width: columnWidths.actions, position: 'relative', whiteSpace: 'normal', overflowWrap: 'break-word' }}>
                    Actions
                    <div
                        style={{
                            position: 'absolute',
                            top: 0,
                            right: 0,
                            width: '30px',
                            height: '100%',
                            cursor: 'col-resize',
                            userSelect: 'none',
                            touchAction: 'none',
                            zIndex: 1,
                            display: 'flex',
                            justifyContent: 'flex-end'
                        }}
                        onPointerDown={(e) => handleResizeStart(e, 'actions')}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div style={{ width: '1px', height: '100%', backgroundColor: 'var(--mantine-color-gray-4)' }} />
                    </div>
                </Table.Th>
            </Table.Tr>
        </Table.Thead>
    );

    const renderRows = (bookingsList: Booking[], isActive: boolean) => bookingsList.map((b) => {
        const isActionLoading = actionLoading === b.id;

        return (
            <Table.Tr key={b.id}>
                <Table.Td>
                    <Group gap="xs" wrap="wrap"> {/* Allow wrap */}
                        <Avatar src={b.rider_photo_url} radius="xl" size="sm" />
                        <div style={{ minWidth: 0 }}>
                            <Text size="sm" fw={500} style={{ overflowWrap: 'break-word', whiteSpace: 'normal' }}>
                                {b.rider_name}
                            </Text>
                            <Text size="xs" c="dimmed" style={{ overflowWrap: 'break-word', whiteSpace: 'normal' }}>
                                {b.rider_rating ? `★ ${b.rider_rating.toFixed(1)}` : 'New'} • {b.rider_completed_rides} rides
                            </Text>
                        </div>
                    </Group>
                </Table.Td>
                <Table.Td>
                    <Text size="sm" style={{ overflowWrap: 'break-word', whiteSpace: 'normal' }}>
                        {b.status.replace(/_/g, ' ')}
                    </Text>
                </Table.Td>
                <Table.Td>
                    <Text size="sm">{b.seats_booked}</Text>
                </Table.Td>
                <Table.Td>
                    <Text size="sm" style={{ overflowWrap: 'break-word', whiteSpace: 'normal' }}>
                        {b.big_luggage > 0 ? `${b.big_luggage} L` : ''} {b.small_luggage > 0 ? `${b.small_luggage} S` : ''}
                        {b.big_luggage === 0 && b.small_luggage === 0 && '-'}
                    </Text>
                </Table.Td>
                <Table.Td>
                    <Text size="sm" c="dimmed" style={{ overflowWrap: 'break-word', whiteSpace: 'normal' }}>
                        {dayjs(b.created_at).format('MMM D, h:mm A')}
                    </Text>
                </Table.Td>
                <Table.Td>
                    {isActive ? (
                        <Stack gap={4} align="flex-start">
                            {b.status === 'waiting_approval' && (
                                <Group gap={4} wrap="nowrap">
                                    <Button
                                        size="xs"
                                        color="green"
                                        variant="light"
                                        loading={isActionLoading}
                                        onClick={() => handleAction(b.id, 'accept')}
                                        leftSection={<IconCheck size={14} />}
                                    >
                                        Accept
                                    </Button>
                                    <Button
                                        size="xs"
                                        color="red"
                                        variant="subtle"
                                        loading={isActionLoading}
                                        onClick={() => handleAction(b.id, 'reject')}
                                        leftSection={<IconX size={14} />}
                                    >
                                        Reject
                                    </Button>
                                </Group>
                            )}

                            {b.status === 'joined_with_pay_window' && (
                                <Button
                                    size="xs"
                                    color="red"
                                    variant="subtle"
                                    loading={isActionLoading}
                                    onClick={() => setRiderToRemove(b)}
                                    leftSection={<IconTrash size={14} />}
                                >
                                    Remove...
                                </Button>
                            )}

                            {b.status === 'pending_pay_confirmation_from_driver' && (
                                <Stack gap={4}>
                                    <Button
                                        size="xs"
                                        color="blue"
                                        variant="light"
                                        loading={isActionLoading}
                                        onClick={() => handleAction(b.id, 'confirm_payment')}
                                        leftSection={<IconCurrencyDollar size={14} />}
                                    >
                                        Confirm Paid
                                    </Button>
                                    <Button
                                        size="xs"
                                        color="red"
                                        variant="subtle"
                                        loading={isActionLoading}
                                        onClick={() => setRiderToRemove(b)}
                                        leftSection={<IconTrash size={14} />}
                                    >
                                        Remove...
                                    </Button>
                                </Stack>
                            )}

                            {(b.status === 'confirmed') && (
                                <Button
                                    size="xs"
                                    color="gray"
                                    variant="subtle"
                                    loading={isActionLoading}
                                    onClick={() => setRiderToRemove(b)}
                                    leftSection={<IconTrash size={14} />}
                                >
                                    Remove...
                                </Button>
                            )}
                        </Stack>
                    ) : (
                        <Text size="xs" c="dimmed">Inactive</Text>
                    )}
                </Table.Td>
            </Table.Tr>
        );
    });

    return (
        <Stack>
            <RemoveRiderModal
                booking={riderToRemove}
                onClose={() => setRiderToRemove(null)}
                onConfirm={handleConfirmRemoval}
                loading={!!actionLoading}
            />

            {/* Active Bookings Section */}
            <div>
                <Group mb="md">
                    <Button
                        color="indigo"
                        variant={tripStatus === 'departed' ? 'filled' : 'light'}
                        onClick={() => handleStatusUpdate('departed')}
                        loading={statusLoading}
                        disabled={tripStatus === 'departed' || tripStatus === 'cancelled' || tripStatus === 'completed'}
                    >
                        {tripStatus === 'departed' ? 'Departed' : 'Mark as Departed'}
                    </Button>
                    <Button
                        color="red"
                        variant="light"
                        onClick={() => setCancelModalOpen(true)}
                        loading={statusLoading}
                        disabled={tripStatus === 'cancelled' || tripStatus === 'completed'}
                    >
                        {tripStatus === 'cancelled' ? 'Cancelled' : 'Cancel Trip'}
                    </Button>
                </Group>

                <Modal opened={cancelModalOpen} onClose={() => setCancelModalOpen(false)} title="Cancel Trip">
                    <Text size="sm" mb="md">Are you sure you want to cancel this trip? This action cannot be undone.</Text>
                    <Group justify="flex-end">
                        <Button variant="default" onClick={() => setCancelModalOpen(false)}>Back</Button>
                        <Button color="red" onClick={() => handleStatusUpdate('cancelled')} loading={statusLoading}>Confirm Cancel</Button>
                    </Group>
                </Modal>

                {activeBookings.length > 0 ? (
                    <>
                        <Text size="sm" c="dimmed" mb="xs">{activeBookings.length} Active Booking{activeBookings.length !== 1 ? 's' : ''}</Text>
                        <div style={{ overflowX: 'auto', margin: '0' }}>
                            <Table horizontalSpacing="xs" verticalSpacing="xs" style={{ minWidth: '500px', tableLayout: 'fixed' }}>
                                {renderHeader()}
                                <Table.Tbody>{renderRows(activeBookings, true)}</Table.Tbody>
                            </Table>
                        </div>
                    </>
                ) : (
                    <Alert icon={<IconInfoCircle size={16} />} title="No Bookings" color="blue">
                        No one has booked this trip yet.
                    </Alert>
                )}
            </div>

            {/* Inactive Bookings Section */}
            {inactiveBookings.length > 0 && (
                <>
                    <UnstyledButton onClick={() => setInactiveOpen(!inactiveOpen)} mt="md">
                        <Group>
                            {inactiveOpen ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
                            <Text size="sm" fw={500}>Inactive Bookings ({inactiveBookings.length})</Text>
                        </Group>
                    </UnstyledButton>
                    <Collapse in={inactiveOpen}>
                        <div style={{ overflowX: 'auto', margin: '0', opacity: 0.7 }}>
                            <Table horizontalSpacing="xs" verticalSpacing="xs" style={{ minWidth: '500px', tableLayout: 'fixed' }}>
                                {renderHeader()}
                                <Table.Tbody>{renderRows(inactiveBookings, false)}</Table.Tbody>
                            </Table>
                        </div>
                    </Collapse>
                </>
            )}
        </Stack>
    );
}
