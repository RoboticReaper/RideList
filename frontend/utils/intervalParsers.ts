export interface PostgresInterval {
    hours?: number;
    minutes?: number;
    seconds?: number;
    days?: number;
    months?: number;
    years?: number;
}

/**
 * Helper to convert various interval formats to total hours.
 * Handles:
 * - Postgres string format "HH:MM:SS"
 * - Postgres interval object { hours, minutes, seconds, ... }
 * - Direct number (already parsed)
 * - String number "1.5"
 */
export function intervalToHours(interval: string | PostgresInterval | number | null | undefined): number {
    if (interval === null || interval === undefined || interval === '') return 0;

    if (typeof interval === 'number') return interval;

    // Handle "1.5" or "2" string numbers
    if (typeof interval === 'string' && !interval.includes(':')) {
        const num = parseFloat(interval);
        return isNaN(num) ? 0 : num;
    }

    // Handle Postgres String "HH:MM:SS"
    if (typeof interval === 'string' && interval.includes(':')) {
        const parts = interval.split(':');
        const h = parseInt(parts[0] || '0', 10);
        const m = parseInt(parts[1] || '0', 10);
        const s = parseInt(parts[2] || '0', 10);
        return h + m / 60 + s / 3600;
    }

    // Handle Postgres Interval Object
    if (typeof interval === 'object') {
        const h = (interval.hours || 0) + (interval.days || 0) * 24; // Simplifying days to hours
        const m = interval.minutes || 0;
        const s = interval.seconds || 0;
        return h + m / 60 + s / 3600;
    }

    return 0;
}

/**
 * Helper to convert various interval formats to total minutes.
 */
export function intervalToMinutes(interval: string | PostgresInterval | number | null | undefined): number {
    if (interval === null || interval === undefined || interval === '') return 0;

    return intervalToHours(interval) * 60;
}


// --- Specific Field Parsers with Defaults ---

/**
 * Parses pay window time. Defaults to 60 minutes if invalid or missing.
 * Returns minutes.
 */
export function parsePayWindow(interval: string | PostgresInterval | number | null | undefined): number {
    const mins = intervalToMinutes(interval);
    return mins > 0 ? mins : 60;
}

/**
 * Parses pay window time for templates. Returns null if invalid or missing.
 * Returns minutes or null.
 */
export function parsePayWindowNullable(interval: string | PostgresInterval | number | null | undefined): number | null {
    const mins = intervalToMinutes(interval);
    return mins > 0 ? mins : null;
}

/**
 * Parses flexibility. Defaults to 0.25 (15 mins) if invalid or missing.
 * Returns hours.
 */
export function parseFlexibility(interval: string | PostgresInterval | number | null | undefined): number {
    const hours = intervalToHours(interval);
    return hours >= 0 ? hours : 0.25;
}

/**
 * Parses flexibility for templates. Returns null if missing/invalid.
 * Returns hours or null.
 */
export function parseFlexibilityNullable(interval: string | PostgresInterval | number | null | undefined): number | null {
    const hours = intervalToHours(interval);
    // Determine if input was "empty".
    // intervalToHours returns 0 for null/undefined/''/garbage.
    // If input is null/undefined/'', return null.
    // If input is '00:00:00' (valid object 0 hours), it returns 0.
    // We need to distinguish "Explicit 0" vs "Empty".
    if (interval === null || interval === undefined || interval === '') return null;
    return hours >= 0 ? hours : null;
}


/**
 * Parses cutoff time. Defaults to 3 hours if missing.
 * Returns hours.
 */
export function parseCutoffTime(interval: string | PostgresInterval | number | null | undefined): number {
    const hours = intervalToHours(interval);
    return hours > 0 ? hours : 3;
}

/**
 * Parses cutoff time for templates. Returns null if missing.
 * Returns hours or null.
 */
export function parseCutoffTimeNullable(interval: string | PostgresInterval | number | null | undefined): number | null {
    const hours = intervalToHours(interval);
    return hours > 0 ? hours : null;
}

/**
 * Parses start check-in time. Defaults to 0 (No specific start time) if missing.
 * Returns hours.
 */
export function parseStartCheckIn(interval: string | PostgresInterval | number | null | undefined): number {
    const hours = intervalToHours(interval);
    return hours > 0 ? hours : 0;
}

/**
 * Parses start check-in time for templates. Returns null if missing.
 * Returns hours or null.
 */
export function parseStartCheckInNullable(interval: string | PostgresInterval | number | null | undefined): number | null {
    const hours = intervalToHours(interval);
    return hours > 0 ? hours : null;
}
