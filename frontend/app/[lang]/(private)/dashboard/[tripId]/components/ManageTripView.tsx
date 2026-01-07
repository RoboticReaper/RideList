import { useEffect, useState, useCallback } from 'react';
import { Table, Avatar, Text, Group, Badge, Loader, Stack, Alert, Button, ActionIcon, Tooltip, Modal, Select, Textarea, Collapse, UnstyledButton, Anchor } from '@mantine/core';
import { useAuth } from '@/components/firebase/AuthContext';
import { IconInfoCircle, IconCheck, IconX, IconTrash, IconCurrencyDollar, IconChevronRight, IconChevronDown, IconLock, IconLockOpen, IconUserCheck, IconSortAscending, IconSortDescending, IconExternalLink } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { notifications } from '@mantine/notifications';
import { useTranslation, Trans } from 'react-i18next';
import { getBookingStatusConfig, getTripStatusConfig } from '@/utils/statusUtils';
import { LocalizedLink } from '@/components/LocalizedLink';

interface Booking {
    id: string;
    rider_id: string;
    seats_booked: number;
    big_luggage: number;
    small_luggage: number;
    status: string;
    created_at: string;
    rider_name: string;
    rider_photo_url: string | null;
    rider_rating: number | null;
    rider_completed_rides: number;
    picked_up?: boolean;
    picked_up_at?: string;
    ready?: boolean;
    ready_at?: string;
    intended_payment_method: string | null;
    rider_phone: string | null;
    rider_phone_visible: 'VISIBLE' | 'REDACTED' | 'MISSING';
    removal_reason?: string | null;
}

interface ManageTripViewProps {
    tripId: string;
    tripStatus: string;
    trip: any;
    onStatusChange: () => void;
    lastRefreshed?: Date;
}




const INACTIVE_STATUSES = ['pay_timeout', 'removed', 'left_paid', 'left_unpaid', 'cancelled'];
// Reasons are localized inside the component now

function RemoveRiderModal({ booking, onClose, onConfirm, loading }: { booking: Booking | null, onClose: () => void, onConfirm: (reason: string) => void, loading: boolean }) {
    const { t } = useTranslation('common');
    const [reason, setReason] = useState<string | null>(null);
    const [note, setNote] = useState('');

    useEffect(() => {
        setReason(null);
        setNote('');
    }, [booking]);

    if (!booking) return null;


    const isPrePayment = booking.status === 'waiting_approval' || booking.status === 'joined_with_pay_window';
    // const reasons = isPrePayment ? PRE_PAYMENT_REASONS : POST_PAYMENT_REASONS; // Replaced by localized arrays
    const prePaymentReasons = [
        { value: 'Luggage requirements not met', label: t('tripDetails.manage.reasons.luggage') },
        { value: 'Pickup mismatch', label: t('tripDetails.manage.reasons.pickup') },
        { value: 'No response', label: t('tripDetails.manage.reasons.noResponse') },
        { value: 'Mistake booking', label: t('tripDetails.manage.reasons.mistake') },
        { value: 'Driver mistake', label: t('tripDetails.manage.reasons.driverMistake') },
        { value: 'Other (pre-payment)', label: t('tripDetails.manage.reasons.otherPre') }
    ];

    const postPaymentReasons = [
        { value: 'Violated rules', label: t('tripDetails.manage.reasons.violated') },
        { value: 'Late cancellation', label: t('tripDetails.manage.reasons.lateCancel') },
        { value: 'No-show', label: t('tripDetails.manage.reasons.noShow') },
        { value: 'Payment issue', label: t('tripDetails.manage.reasons.paymentIssue') },
        { value: 'Other (post-payment)', label: t('tripDetails.manage.reasons.otherPost') }
    ];

    const reasons = isPrePayment ? prePaymentReasons : postPaymentReasons;
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
        <Modal opened={!!booking} onClose={onClose} title={t('tripDetails.manage.modals.removeRider.title')}>
            <Stack>
                <Text size="sm">
                    <Trans
                        i18nKey="tripDetails.manage.modals.removeRider.description"
                        values={{ name: booking.rider_name }}
                        components={{ 1: <b /> }}
                    />
                </Text>

                <Select
                    label={t('tripDetails.manage.modals.removeRider.reasonLabel')}
                    placeholder={t('tripDetails.manage.modals.removeRider.reasonPlaceholder')}
                    data={reasons}
                    value={reason}
                    onChange={setReason}
                    allowDeselect={false}
                />

                {isOther && (
                    <Textarea
                        label={t('tripDetails.manage.modals.removeRider.noteLabel')}
                        placeholder={t('tripDetails.manage.modals.removeRider.notePlaceholder')}
                        value={note}
                        onChange={(event) => setNote(event.currentTarget.value)}
                        minRows={3}
                        required
                    />
                )}

                <Group justify="flex-end" mt="md">
                    <Button variant="default" onClick={onClose} disabled={loading}>{t('tripDetails.manage.actions.back')}</Button>
                    <Button
                        color="red"
                        onClick={handleSubmit}
                        loading={loading}
                        disabled={!reason || (isOther && !note.trim())}
                    >
                        {t('tripDetails.manage.modals.removeRider.confirm')}
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
}

export function ManageTripView({ tripId, tripStatus, trip, onStatusChange, lastRefreshed }: ManageTripViewProps) {
    const { t } = useTranslation('common');
    const { user } = useAuth();
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [inactiveOpen, setInactiveOpen] = useState(false);

    const isReadOnly = tripStatus === 'cancelled' || tripStatus === 'done' || tripStatus === 'aborted';

    // Removal Modal State
    const [riderToRemove, setRiderToRemove] = useState<Booking | null>(null);

    // Cancel Trip Modal
    const [cancelModalOpen, setCancelModalOpen] = useState(false);
    const [abortModalOpen, setAbortModalOpen] = useState(false);
    const [completeModalOpen, setCompleteModalOpen] = useState(false);
    const [lockModalOpen, setLockModalOpen] = useState(false);
    const [unlockModalOpen, setUnlockModalOpen] = useState(false);

    const [departModalOpen, setDepartModalOpen] = useState(false);
    const [checkInModalOpen, setCheckInModalOpen] = useState(false);
    const [statusLoading, setStatusLoading] = useState(false);



    // Sorting State
    const [sortBy, setSortBy] = useState<string | null>('created_at');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

    const [columnWidths, setColumnWidths] = useState({
        rider: 150,
        phone: 120,
        status: 150,
        seats: 80,
        luggage: 80,
        payment: 100,
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

            if (!res.ok) throw new Error(t('tripDetails.manage.notifications.fetchError'));
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

            if (!res.ok) throw new Error(data.error || t('tripDetails.manage.notifications.actionFailed'));

            if (action === 'remove') {
                notifications.show({
                    title: t('tripDetails.manage.notifications.success.title'),
                    message: t('tripDetails.manage.notifications.removeSuccess.message'),
                    color: 'green',
                    autoClose: 5000
                });
            } else if (action === 'mark_picked_up') {
                notifications.show({
                    title: t('tripDetails.manage.notifications.success.title'),
                    message: t('tripDetails.manage.notifications.pickedUpSuccess.message'),
                    color: 'green'
                });
            } else {
                notifications.show({
                    title: t('tripDetails.manage.notifications.success.title'),
                    message: t('tripDetails.manage.notifications.updateSuccess.message'),
                    color: 'green'
                });
            }

            // Close modal if open
            setRiderToRemove(null);

            // Refresh list
            await fetchBookings();

        } catch (err: any) {
            notifications.show({
                title: t('tripDetails.manage.notifications.error.title'),
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

    const handleStatusUpdate = async (newStatus: 'departed' | 'cancelled' | 'locked' | 'bookable' | 'done' | 'aborted') => {
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
            if (!res.ok) throw new Error(data.error || t('tripDetails.manage.notifications.updateStatusFailed'));

            notifications.show({
                title: t('tripDetails.success.title'),
                message: t(getTripStatusConfig(newStatus).labelKey),
                color: 'green'
            });

            if (newStatus === 'cancelled') {
                setCancelModalOpen(false);
            } else if (newStatus === 'departed') {
                setDepartModalOpen(false);
            } else if (newStatus === 'locked') {
                setLockModalOpen(false);
            } else if (newStatus === 'bookable') {
                setUnlockModalOpen(false);
            } else if (newStatus === 'done') {
                setCompleteModalOpen(false);
            } else if (newStatus === 'aborted') {
                setAbortModalOpen(false);
            }

            onStatusChange();

        } catch (err: any) {
            notifications.show({
                title: t('tripDetails.manage.notifications.error.title'),
                message: err.message,
                color: 'red'
            });
        } finally {
            setStatusLoading(false);
        }
    };

    const handleEnableCheckIn = async () => {
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
                body: JSON.stringify({ start_check_in: true })
            });
            if (!res.ok) throw new Error(t('tripDetails.manage.notifications.startCheckInFailed'));

            notifications.show({ title: t('tripDetails.manage.notifications.success.title'), message: t('tripDetails.manage.notifications.checkInStarted'), color: 'green' });

            setCheckInModalOpen(false);
            onStatusChange();
        } catch (error) {
            notifications.show({ title: t('tripDetails.manage.notifications.error.title'), message: t('tripDetails.manage.notifications.startCheckInFailed'), color: 'red' });
        } finally {
            setStatusLoading(false);
        }
    };

    if (loading) return <Loader />;
    if (error) return <Alert color="red" title={t('tripDetails.manage.notifications.error.title')}>{error}</Alert>;


    const activeBookings = bookings.filter(b => !INACTIVE_STATUSES.includes(b.status));

    const sortedBookings = [...activeBookings].sort((a, b) => {
        if (!sortBy) return 0;

        let valueA: any = a[sortBy as keyof Booking];
        let valueB: any = b[sortBy as keyof Booking];

        // Specific handling for derived or complex sorts
        if (sortBy === 'luggage') {
            valueA = a.big_luggage + a.small_luggage;
            valueB = b.big_luggage + b.small_luggage;
        } else if (sortBy === 'created_at') {
            valueA = new Date(a.created_at).getTime();
            valueB = new Date(b.created_at).getTime();
        } else if (sortBy === 'status') {
            // Custom status order if needed, otherwise string compare
            // Adding 'picked_up' weight
            if (a.picked_up !== b.picked_up) {
                // If one is picked up, prioritize it (or de-prioritize)? 
                // Let's just treat picked_up as a status modifier or separate sort?
                // The prompt asked for "rider picked up" sort.
                // Let's stick to simple string compare for status, and handle picked_up separately if selected
            }
        }

        if (sortBy === 'picked_up') {
            valueA = a.picked_up ? 1 : 0;
            valueB = b.picked_up ? 1 : 0;
        }

        if (valueA < valueB) return sortDirection === 'asc' ? -1 : 1;
        if (valueA > valueB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });

    const inactiveBookings = bookings.filter(b => INACTIVE_STATUSES.includes(b.status));

    const renderHeader = () => (
        <Table.Thead>
            <Table.Tr>
                <Table.Th style={{ width: columnWidths.rider, position: 'relative', whiteSpace: 'normal', overflowWrap: 'break-word' }}>
                    {t('tripDetails.manage.table.rider')}
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
                <Table.Th style={{ width: columnWidths.phone, position: 'relative', whiteSpace: 'normal', overflowWrap: 'break-word' }}>
                    {t('tripDetails.manage.table.phone')}
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
                        onPointerDown={(e) => handleResizeStart(e, 'phone' as any)}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div style={{ width: '1px', height: '100%', backgroundColor: 'var(--mantine-color-gray-4)' }} />
                    </div>
                </Table.Th>
                <Table.Th style={{ width: columnWidths.status, position: 'relative', whiteSpace: 'normal', overflowWrap: 'break-word' }}>
                    {t('tripDetails.manage.table.status')}
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
                    {t('tripDetails.manage.table.seats')}
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
                    {t('tripDetails.manage.table.luggage')}
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
                <Table.Th style={{ width: columnWidths.payment, position: 'relative', whiteSpace: 'normal', overflowWrap: 'break-word' }}>
                    {t('tripDetails.manage.table.paymentMethod')}
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
                        onPointerDown={(e) => handleResizeStart(e, 'payment')}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div style={{ width: '1px', height: '100%', backgroundColor: 'var(--mantine-color-gray-4)' }} />
                    </div>
                </Table.Th>
                <Table.Th style={{ width: columnWidths.createdAt, position: 'relative', whiteSpace: 'normal', overflowWrap: 'break-word' }}>
                    {t('tripDetails.manage.table.bookedAt')}
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
                    {t('tripDetails.manage.table.actions')}
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
                            <Group gap={4}>
                                <Text size="sm" fw={500} style={{ overflowWrap: 'break-word', whiteSpace: 'normal' }}>
                                    {b.rider_name}
                                </Text>
                                <ActionIcon
                                    component={LocalizedLink}
                                    href={`/profile/${b.rider_id}`}
                                    target="_blank"
                                    size="xs"
                                    variant="subtle"
                                    color="gray"
                                >
                                    <IconExternalLink size={14} />
                                </ActionIcon>
                            </Group>
                            <Text size="xs" c="dimmed" style={{ overflowWrap: 'break-word', whiteSpace: 'normal' }}>
                                {b.rider_rating ? `★ ${b.rider_rating.toFixed(1)}` : t('common.new')} • {t('tripDetails.manage.rides', { count: b.rider_completed_rides })}
                            </Text>
                            {trip.start_check_in && b.ready && (
                                <Badge color="green" size="sm" variant="light" mt={4}>
                                    {t('common.ready')}
                                </Badge>
                            )}
                        </div>
                    </Group>
                </Table.Td>
                <Table.Td>
                    {(() => {
                        if (b.rider_phone_visible === 'MISSING') {
                            return <Text size="sm" c="dimmed">{t('tripDetails.manage.phone.missing')}<br /><Text span size="xs">({t('tripDetails.manage.phone.notProvided')})</Text></Text>;
                        }
                        if (b.rider_phone_visible === 'REDACTED') {
                            let reason = t('tripDetails.manage.phone.hiddenReasons.tripEnded');
                            if (b.status === 'removed') reason = t('tripDetails.manage.phone.hiddenReasons.riderRemoved');
                            else if (b.status === 'waiting_approval') reason = t('tripDetails.manage.phone.hiddenReasons.notConfirmed');
                            else if (INACTIVE_STATUSES.includes(b.status)) reason = t('tripDetails.manage.phone.hiddenReasons.bookingInactive');

                            return <Text size="sm" c="dimmed">{t('tripDetails.manage.phone.hidden')}<br /><Text span size="xs">({reason})</Text></Text>;
                        }
                        return <Text size="sm">{b.rider_phone}</Text>;
                    })()}
                </Table.Td>
                <Table.Td>
                    <Text size="sm" style={{ overflowWrap: 'break-word', whiteSpace: 'normal' }}>
                        {t(getBookingStatusConfig(b.status).labelKey)}
                        {b.status === 'removed' && b.removal_reason && `, (${t('tripDetails.manage.reasons.reason')}: ${b.removal_reason})`}
                        {b.picked_up && t('tripDetails.manage.status.pickedUpSuffix')}
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
                    <Text size="sm" style={{ overflowWrap: 'break-word', whiteSpace: 'normal' }}>
                        {b.intended_payment_method || t('common.none')}
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
                            {b.status === 'waiting_approval' && !isReadOnly && (
                                <Group gap={4} wrap="nowrap">
                                    <Button
                                        size="xs"
                                        color="green"
                                        variant="light"
                                        loading={isActionLoading}
                                        onClick={() => handleAction(b.id, 'accept')}
                                        leftSection={<IconCheck size={14} />}
                                    >
                                        {t('tripDetails.manage.actions.accept')}
                                    </Button>
                                    <Button
                                        size="xs"
                                        color="red"
                                        variant="subtle"
                                        loading={isActionLoading}
                                        onClick={() => handleAction(b.id, 'reject')}
                                        leftSection={<IconX size={14} />}
                                    >
                                        {t('tripDetails.manage.actions.reject')}
                                    </Button>
                                </Group>
                            )}

                            {b.status === 'joined_with_pay_window' && !isReadOnly && (
                                <Button
                                    size="xs"
                                    color="red"
                                    variant="subtle"
                                    loading={isActionLoading}
                                    onClick={() => setRiderToRemove(b)}
                                    leftSection={<IconTrash size={14} />}
                                >
                                    {t('tripDetails.manage.actions.remove')}
                                </Button>
                            )}

                            {b.status === 'pending_pay_confirmation_from_driver' && !isReadOnly && (
                                <Stack gap={4}>
                                    <Button
                                        size="xs"
                                        color="blue"
                                        variant="light"
                                        loading={isActionLoading}
                                        onClick={() => handleAction(b.id, 'confirm_payment')}
                                        leftSection={<IconCurrencyDollar size={14} />}
                                    >
                                        {t('tripDetails.manage.actions.confirmPaid')}
                                    </Button>
                                    <Button
                                        size="xs"
                                        color="red"
                                        variant="subtle"
                                        loading={isActionLoading}
                                        onClick={() => setRiderToRemove(b)}
                                        leftSection={<IconTrash size={14} />}
                                    >
                                        {t('tripDetails.manage.actions.remove')}
                                    </Button>
                                </Stack>
                            )}

                            {(b.status === 'confirmed') && (
                                <Stack gap={4}>
                                    {!b.picked_up && tripStatus === 'departed' && (
                                        <Button
                                            size="xs"
                                            color="indigo"
                                            variant="light"
                                            loading={isActionLoading}
                                            onClick={() => handleAction(b.id, 'mark_picked_up')}
                                            leftSection={<IconUserCheck size={14} />}
                                        >
                                            {t('tripDetails.manage.actions.markPickedUp')}
                                        </Button>
                                    )}
                                    {tripStatus !== 'departed' && tripStatus !== 'done' && tripStatus !== 'cancelled' && (
                                        <Button
                                            size="xs"
                                            color="gray"
                                            variant="subtle"
                                            loading={isActionLoading}
                                            onClick={() => setRiderToRemove(b)}
                                            leftSection={<IconTrash size={14} />}
                                        >
                                            {t('tripDetails.manage.actions.removeEllipsis')}
                                        </Button>
                                    )}
                                </Stack>
                            )}
                        </Stack>
                    ) : (
                        null
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
                    {!trip.start_check_in && !isReadOnly && (
                        <Button
                            color="orange"
                            variant="light"
                            onClick={() => setCheckInModalOpen(true)}
                            loading={statusLoading}
                        >
                            {t('tripDetails.manage.actions.enableCheckIn')}
                        </Button>
                    )}
                    {tripStatus !== 'departed' && tripStatus !== 'cancelled' && tripStatus !== 'done' && tripStatus !== 'aborted' && (
                        <Button
                            color="indigo"
                            variant="light"
                            onClick={() => {
                                if (!trip.driver?.phone) {
                                    notifications.show({
                                        title: t('tripDetails.manage.notifications.profileIncomplete.title'),
                                        message: (
                                            <Trans
                                                i18nKey="tripDetails.manage.notifications.profileIncomplete.message"
                                                t={t}
                                                components={{
                                                    1: <Anchor component={LocalizedLink} href={`/profile/${trip.driver.id}`} style={{ textDecoration: 'underline' }} />
                                                }}
                                            />
                                        ),
                                        color: 'red',
                                        autoClose: 6000,
                                    });
                                    return;
                                }
                                if (!trip.car) {
                                    notifications.show({
                                        title: t('tripDetails.manage.notifications.noVehicle.title'),
                                        message: t('tripDetails.manage.notifications.noVehicle.message'),
                                        color: 'red'
                                    });
                                    return;
                                }
                                setDepartModalOpen(true);
                            }}
                            loading={statusLoading}
                        >
                            {t('tripDetails.manage.actions.startPickup')}
                        </Button>
                    )}
                    {tripStatus === 'departed' && (
                        <Button
                            color="green"
                            variant="light"
                            onClick={() => setCompleteModalOpen(true)}
                            loading={statusLoading}
                        >
                            {t('tripDetails.manage.actions.tripCompleted')}
                        </Button>
                    )}
                    {tripStatus === 'departed' && (
                        <Button
                            color="red"
                            variant="light"
                            onClick={() => setAbortModalOpen(true)}
                            loading={statusLoading}
                        >
                            {t('tripDetails.manage.actions.abortTrip')}
                        </Button>
                    )}
                    {(tripStatus === 'bookable' || tripStatus === 'full' || tripStatus === 'locked') && (
                        <Button
                            color="orange"
                            variant={tripStatus === 'locked' ? 'filled' : 'light'}
                            onClick={() => tripStatus === 'locked' ? setUnlockModalOpen(true) : setLockModalOpen(true)}
                            loading={statusLoading}
                            leftSection={tripStatus === 'locked' ? <IconLock size={16} /> : undefined}
                        >
                            {tripStatus === 'locked' ? t('tripDetails.manage.actions.unlockTrip') : t('tripDetails.manage.actions.lockTrip')}
                        </Button>
                    )}
                    {tripStatus !== 'cancelled' && tripStatus !== 'done' && tripStatus !== 'departed' && tripStatus !== 'aborted' && (
                        <Button
                            color="red"
                            variant="light"
                            onClick={() => setCancelModalOpen(true)}
                            loading={statusLoading}
                        >
                            {t('tripDetails.manage.actions.cancelTrip')}
                        </Button>
                    )}
                </Group>



                <Modal opened={departModalOpen} onClose={() => setDepartModalOpen(false)} title={t('tripDetails.manage.modals.startPickup.title')}>
                    <Stack>
                        <Text size="sm">
                            {t('tripDetails.manage.modals.startPickup.description')}
                        </Text>
                        <Alert color="indigo" icon={<IconInfoCircle size={16} />} title={t('tripDetails.manage.modals.startPickup.impactTitle')}>
                            <Text size="sm">
                                {t('tripDetails.manage.modals.startPickup.impactDescription')}
                            </Text>
                        </Alert>
                        <Group justify="flex-end" mt="md">
                            <Button variant="default" onClick={() => setDepartModalOpen(false)}>{t('tripDetails.manage.actions.back')}</Button>
                            <Button color="indigo" onClick={() => handleStatusUpdate('departed')} loading={statusLoading}>
                                {t('tripDetails.manage.modals.startPickup.confirm')}
                            </Button>
                        </Group>
                    </Stack>
                </Modal>

                <Modal opened={checkInModalOpen} onClose={() => setCheckInModalOpen(false)} title={t('tripDetails.manage.modals.enableCheckIn.title')}>
                    <Stack>
                        <Text size="sm">
                            {t('tripDetails.manage.modals.enableCheckIn.description')}
                        </Text>
                        <Alert color="orange" icon={<IconInfoCircle size={16} />} title={t('tripDetails.manage.modals.enableCheckIn.impactTitle')}>
                            <Text size="sm">
                                {t('tripDetails.manage.modals.enableCheckIn.impactDescription')}
                            </Text>
                        </Alert>
                        <Group justify="flex-end" mt="md">
                            <Button variant="default" onClick={() => setCheckInModalOpen(false)}>{t('tripDetails.manage.actions.back')}</Button>
                            <Button color="orange" onClick={handleEnableCheckIn} loading={statusLoading}>
                                {t('tripDetails.manage.modals.enableCheckIn.confirm')}
                            </Button>
                        </Group>
                    </Stack>
                </Modal>

                <Modal opened={lockModalOpen} onClose={() => setLockModalOpen(false)} title={t('tripDetails.manage.modals.lockTrip.title')}>
                    <Stack>
                        <Text size="sm">
                            {t('tripDetails.manage.modals.lockTrip.description')}
                        </Text>
                        <Alert color="blue" icon={<IconInfoCircle size={16} />} title={t('tripDetails.manage.modals.lockTrip.impactTitle')}>
                            <Stack gap="xs">
                                <Text size="sm">
                                    • {t('tripDetails.manage.modals.lockTrip.impact1')}
                                </Text>
                                <Text size="sm">
                                    • {t('tripDetails.manage.modals.lockTrip.impact2')}
                                </Text>
                                <Text size="sm">
                                    • {t('tripDetails.manage.modals.lockTrip.impact3')}
                                </Text>
                            </Stack>
                        </Alert>
                        <Group justify="flex-end" mt="md">
                            <Button variant="default" onClick={() => setLockModalOpen(false)}>{t('tripDetails.manage.actions.back')}</Button>
                            <Button color="orange" onClick={() => handleStatusUpdate('locked')} loading={statusLoading} leftSection={<IconLock size={16} />}>
                                {t('tripDetails.manage.modals.lockTrip.confirm')}
                            </Button>
                        </Group>
                    </Stack>
                </Modal>

                <Modal opened={unlockModalOpen} onClose={() => setUnlockModalOpen(false)} title={t('tripDetails.manage.modals.unlockTrip.title')}>
                    <Stack>
                        <Text size="sm">
                            {t('tripDetails.manage.modals.unlockTrip.description')}
                        </Text>
                        <Alert color="green" icon={<IconLockOpen size={16} />} title={t('tripDetails.manage.modals.unlockTrip.impactTitle')}>
                            <Stack gap="xs">
                                <Text size="sm">
                                    • {t('tripDetails.manage.modals.unlockTrip.impact1')}
                                </Text>
                                <Text size="sm">
                                    • {t('tripDetails.manage.modals.unlockTrip.impact2')}
                                </Text>
                            </Stack>
                        </Alert>
                        <Group justify="flex-end" mt="md">
                            <Button variant="default" onClick={() => setUnlockModalOpen(false)}>{t('tripDetails.manage.actions.back')}</Button>
                            <Button color="green" onClick={() => handleStatusUpdate('bookable')} loading={statusLoading} leftSection={<IconLockOpen size={16} />}>
                                {t('tripDetails.manage.modals.unlockTrip.confirm')}
                            </Button>
                        </Group>
                    </Stack>
                </Modal>

                <Modal opened={cancelModalOpen} onClose={() => setCancelModalOpen(false)} title={t('tripDetails.manage.modals.cancelTrip.title')}>
                    <Text size="sm" mb="md">{t('tripDetails.manage.modals.cancelTrip.description')}</Text>
                    <Group justify="flex-end">
                        <Button variant="default" onClick={() => setCancelModalOpen(false)}>{t('tripDetails.manage.actions.back')}</Button>
                        <Button color="red" onClick={() => handleStatusUpdate('cancelled')} loading={statusLoading}>{t('tripDetails.manage.modals.cancelTrip.confirm')}</Button>
                    </Group>
                </Modal>

                <Modal opened={abortModalOpen} onClose={() => setAbortModalOpen(false)} title={t('tripDetails.manage.modals.abortTrip.title')}>
                    <Stack>
                        <Text size="sm">{t('tripDetails.manage.modals.abortTrip.description')}</Text>
                        <Alert color="red" icon={<IconInfoCircle size={16} />} title={t('tripDetails.manage.modals.abortTrip.impactTitle')}>
                            <Stack gap={0}>
                                <Text size="sm">
                                    <Trans
                                        i18nKey="tripDetails.manage.modals.abortTrip.impact1"
                                        components={{ 1: <b />, 2: <b /> }}
                                    />
                                </Text>
                                <Text size="sm">
                                    <Trans
                                        i18nKey="tripDetails.manage.modals.abortTrip.impact2"
                                        components={{ 1: <b />, 2: <b /> }}
                                    />
                                </Text>
                            </Stack>
                        </Alert>
                        <Group justify="flex-end" mt="md">
                            <Button variant="default" onClick={() => setAbortModalOpen(false)}>{t('tripDetails.manage.actions.back')}</Button>
                            <Button color="red" onClick={() => handleStatusUpdate('aborted')} loading={statusLoading}>{t('tripDetails.manage.modals.abortTrip.confirm')}</Button>
                        </Group>
                    </Stack>
                </Modal>

                <Modal opened={completeModalOpen} onClose={() => setCompleteModalOpen(false)} title={t('tripDetails.manage.modals.completeTrip.title')}>
                    <Text size="sm" mb="md">{t('tripDetails.manage.modals.completeTrip.description')}</Text>
                    <Group justify="flex-end">
                        <Button variant="default" onClick={() => setCompleteModalOpen(false)}>{t('tripDetails.manage.actions.back')}</Button>
                        <Button color="green" onClick={() => handleStatusUpdate('done')} loading={statusLoading}>{t('tripDetails.manage.modals.completeTrip.confirm')}</Button>
                    </Group>
                </Modal>

                {

                    activeBookings.length > 0 ? (
                        <>
                            <Group justify="space-between" mb="xs" align="center">
                                <Text size="sm" c="dimmed">
                                    {t('tripDetails.manage.activeBookingsCount', { count: activeBookings.length })}
                                </Text>
                                <Group gap="xs">
                                    <Select
                                        size="xs"
                                        placeholder={t('tripDetails.manage.sort.placeholder')}
                                        data={[
                                            { value: 'created_at', label: t('tripDetails.manage.sort.bookedAt') },
                                            { value: 'rider_name', label: t('tripDetails.manage.sort.riderName') },
                                            { value: 'ready', label: t('tripDetails.manage.sort.riderReady') },
                                            { value: 'status', label: t('tripDetails.manage.sort.status') },
                                            { value: 'picked_up', label: t('tripDetails.manage.sort.pickedUp') },
                                            { value: 'seats_booked', label: t('tripDetails.manage.sort.seats') },
                                            { value: 'luggage', label: t('tripDetails.manage.sort.luggage') },
                                        ]}
                                        value={sortBy}
                                        onChange={setSortBy}
                                        allowDeselect={false}
                                        style={{ width: 140 }}
                                    />
                                    <ActionIcon
                                        variant="light"
                                        color="gray"
                                        size="md"
                                        onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
                                        title={sortDirection === 'asc' ? t('tripDetails.manage.sort.ascending') : t('tripDetails.manage.sort.descending')}
                                    >
                                        {sortDirection === 'asc' ? <IconSortAscending size={16} /> : <IconSortDescending size={16} />}
                                    </ActionIcon>
                                </Group>
                            </Group>
                            <div style={{ overflowX: 'auto', margin: '0' }}>
                                <Table horizontalSpacing="xs" verticalSpacing="xs" style={{ minWidth: '500px', tableLayout: 'fixed' }}>
                                    {renderHeader()}
                                    <Table.Tbody>{renderRows(sortedBookings, true)}</Table.Tbody>
                                </Table>
                            </div>
                        </>
                    ) : (
                        <Alert icon={<IconInfoCircle size={16} />} title={t('tripDetails.alerts.noBookings.title')} color="blue">
                            {t('tripDetails.alerts.noBookings.description')}
                        </Alert>
                    )
                }
            </div >

            {/* Inactive Bookings Section */}
            {
                inactiveBookings.length > 0 && (
                    <>
                        <UnstyledButton onClick={() => setInactiveOpen(!inactiveOpen)} mt="md">
                            <Group>
                                {inactiveOpen ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
                                <Text size="sm" fw={500}>{t('tripDetails.manage.inactiveBookingsCount', { count: inactiveBookings.length })}</Text>
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
                )
            }
        </Stack >
    );
}
