export interface StatusConfig {
    color: string;
    labelKey: string;
}

export const TRIP_STATUS_CONFIG: Record<string, StatusConfig> = {
    bookable: { color: 'green', labelKey: 'status.trip.bookable' },
    locked: { color: 'orange', labelKey: 'status.trip.locked' },
    full: { color: 'red', labelKey: 'status.trip.full' },
    departed: { color: 'blue', labelKey: 'status.trip.departed' },
    done: { color: 'gray', labelKey: 'status.trip.completed' },
    cancelled: { color: 'gray', labelKey: 'status.trip.cancelled' },
    aborted: { color: 'gray', labelKey: 'status.trip.aborted' },
};

export const BOOKING_STATUS_CONFIG: Record<string, StatusConfig> = {
    waiting_approval: { color: 'blue', labelKey: 'status.booking.waiting_approval' },
    joined_with_pay_window: { color: 'orange', labelKey: 'status.booking.joined_with_pay_window' },
    pending_pay_confirmation_from_driver: { color: 'purple', labelKey: 'status.booking.pending_pay_confirmation_from_driver' },
    confirmed: { color: 'green', labelKey: 'status.booking.confirmed' },
    pay_timeout: { color: 'gray', labelKey: 'status.booking.pay_timeout' },
    left_paid: { color: 'gray', labelKey: 'status.booking.left_paid' },
    left_unpaid: { color: 'gray', labelKey: 'status.booking.left_unpaid' },
    removed: { color: 'red', labelKey: 'status.booking.removed' },
    cancelled: { color: 'red', labelKey: 'status.booking.cancelled' },
    completed: { color: 'green', labelKey: 'status.booking.completed' },
    no_show: { color: 'gray', labelKey: 'status.booking.no_show' },
};

export function getTripStatusConfig(status: string): StatusConfig {
    return TRIP_STATUS_CONFIG[status] || { color: 'gray', labelKey: 'status.trip.bookable' };
}

export function getBookingStatusConfig(status: string): StatusConfig {
    return BOOKING_STATUS_CONFIG[status] || { color: 'gray', labelKey: 'status.booking.waiting_approval' };
}
