export interface PostgresInterval {
    days?: number;
    hours?: number;
    minutes?: number;
    seconds?: number;
    milliseconds?: number;
}

/**
 * Parses a Postgres interval object or number (hours) into milliseconds.
 */
export function parsePostgresIntervalToMs(interval: PostgresInterval | number | null | undefined): number {
    if (interval === null || interval === undefined) {
        return 0;
    }

    if (typeof interval === 'number') {
        // Treat number as hours (backward compatibility / numeric columns)
        return interval * 60 * 60 * 1000;
    }

    if (typeof interval === 'object') {
        const days = interval.days || 0;
        const hours = interval.hours || 0;
        const minutes = interval.minutes || 0;
        const seconds = interval.seconds || 0;
        const milliseconds = interval.milliseconds || 0;

        return (
            days * 24 * 60 * 60 * 1000 +
            hours * 60 * 60 * 1000 +
            minutes * 60 * 1000 +
            seconds * 1000 +
            milliseconds
        );
    }

    return 0;
}

/**
 * Parses a string interval (e.g., "60 minutes", "1.5 hours") into milliseconds.
 * Returns 0 if parsing fails or input is invalid.
 */
export function parseStringIntervalToMs(interval: string | null | undefined): number {
    if (!interval) return 0;

    const parts = interval.trim().split(' ');
    if (parts.length !== 2) return 0;

    const value = parseFloat(parts[0]);
    const unit = parts[1].toLowerCase();

    if (isNaN(value)) return 0;

    switch (unit) {
        case 'minute':
        case 'minutes':
            return value * 60 * 1000;
        case 'hour':
        case 'hours':
            return value * 60 * 60 * 1000;
        case 'day':
        case 'days':
            return value * 24 * 60 * 60 * 1000;
        case 'second':
        case 'seconds':
            return value * 1000;
        default:
            return 0;
    }
}

/**
 * Compares two interval values (Postgres object, number, or string) for equality.
 * Returns true if they represent the same duration in milliseconds.
 */
export function areIntervalsEqual(a: any, b: any): boolean {
    // 1. Normalize A
    let msA = 0;
    if (typeof a === 'string') msA = parseStringIntervalToMs(a);
    else msA = parsePostgresIntervalToMs(a);

    // 2. Normalize B
    let msB = 0;
    if (typeof b === 'string') msB = parseStringIntervalToMs(b);
    else msB = parsePostgresIntervalToMs(b);

    // 3. Compare with a small tolerance for floating point math if needed, but integers should be fine for ms.
    // However, if we support fractional hours in strings (0.25 hours), we might get floats.
    // Let's use written logic:
    return Math.abs(msA - msB) < 100; // 100ms tolerance
}
