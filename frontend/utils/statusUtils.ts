export interface StatusConfig {
    color: string;
    label: string;
}

export const TRIP_STATUS_CONFIG: Record<string, StatusConfig> = {
    bookable: { color: 'green', label: 'Bookable' },
    locked: { color: 'orange', label: 'Locked' },
    full: { color: 'red', label: 'Full' },
    departed: { color: 'blue', label: 'Pickup Started' },
    done: { color: 'gray', label: 'Completed' },
    cancelled: { color: 'gray', label: 'Cancelled' },
    aborted: { color: 'gray', label: 'Aborted' },
};

export const BOOKING_STATUS_CONFIG: Record<string, StatusConfig> = {
    waiting_approval: { color: 'blue', label: 'Waiting Driver Approval' },
    joined_with_pay_window: { color: 'orange', label: 'Waiting Rider Payment' },
    pending_pay_confirmation_from_driver: { color: 'purple', label: 'Waiting Payment Confirmation' },
    confirmed: { color: 'green', label: 'Confirmed' },
    pay_timeout: { color: 'gray', label: 'Pay Timeout' },
    left_paid: { color: 'gray', label: 'Left Paid' },
    left_unpaid: { color: 'gray', label: 'Left Unpaid' },
    removed: { color: 'red', label: 'Removed' },
    cancelled: { color: 'red', label: 'Cancelled' },
    completed: { color: 'green', label: 'Completed' },
    no_show: { color: 'gray', label: 'No Show' },
};

export function getTripStatusConfig(status: string): StatusConfig {
    return TRIP_STATUS_CONFIG[status] || { color: 'gray', label: status.replace(/_/g, ' ').toUpperCase() };
}

export function getBookingStatusConfig(status: string): StatusConfig {
    return BOOKING_STATUS_CONFIG[status] || { color: 'gray', label: status.replace(/_/g, ' ') };
}
