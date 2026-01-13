import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(relativeTime);

export const CHICAGO_TZ = 'America/Chicago';
dayjs.tz.setDefault(CHICAGO_TZ);

export default dayjs;

/**
 * Converts a Javascript Date (which represents local time) to a UTC ISO string
 * that corresponds to the same wall-clock time in Chicago.
 * 
 * Example: User in Paris (UTC+1) picks 10:00 AM.
 * JS Date is 10:00 AM Paris (09:00 UTC).
 * We want to store 10:00 AM Chicago (16:00 UTC).
 * 
 * @param date The local javascript Date object
 * @returns ISO string of the Chicago-equivalent time in UTC
 */
export function toChicagoISO(date: Date): string {
    // Format input date as YYYY-MM-DD HH:mm:ss to preserve wall-clock time components
    const localString = dayjs(date).format('YYYY-MM-DD HH:mm:ss');
    // Parse as Chicago time
    const chicagoDate = dayjs.tz(localString, CHICAGO_TZ);
    // Return ISO
    return chicagoDate.toISOString();
}

/**
 * Converts a UTC ISO string (which represents a Chicago time) back to a Javascript Date
 * that has the same wall-clock time in the local timezone.
 * 
 * Example: Database has 16:00 UTC (10:00 Chicago).
 * User in Paris should see 10:00 AM in picker.
 * 
 * @param isoString The UTC ISO string from the server/URL
 * @returns JS Date object representing that wall-clock time in local time
 */
export function fromChicagoISO(isoString: string): Date {
    // Treat the ISO string as a timestamp, convert to Chicago wall time
    const chicagoDate = dayjs(isoString).tz(CHICAGO_TZ);
    // Get the wall-clock components
    const dateString = chicagoDate.format('YYYY-MM-DD HH:mm:ss');
    // Create a local Date object with those components
    // using dayjs() to parse ensures cross-browser compatibility (safari hates 'YYYY-MM-DD HH:mm:ss' in new Date())
    return dayjs(dateString).toDate();
}

/**
 * Returns a Javascript Date object that represents the current wall-clock time in Chicago.
 * Useful for setting minDate in DatePicker components where the selection is treated as Chicago time.
 */
export function getChicagoNow(): Date {
    // Get current time in Chicago
    const nowChicago = dayjs().tz(CHICAGO_TZ);
    // Format to wall-clock string
    const dateString = nowChicago.format('YYYY-MM-DD HH:mm:ss');
    // Return as JS Date
    return dayjs(dateString).toDate();
}


/**
 * Checks if a given Chicago-wall-clock Date is in the future relative to Chicago now.
 * @param date The JS Date object representing Chicago wall-clock time
 */
export function isAfterChicagoNow(date: Date): boolean {
    const chicagoNow = dayjs().tz(CHICAGO_TZ);
    const inputDate = dayjs.tz(date.toISOString(), CHICAGO_TZ); // Treat input as Chicago time if possible, or just compare value?
    // Actually, our convention for 'date' here (from getChicagoNow or date pickers) 
    // is that it IS the wall clock time in Chicago.
    // So we should compare the wall clock string values to be safe, or convert everything to Chicago dayjs objects.

    // Robust way:
    const nowRef = dayjs().tz(CHICAGO_TZ);
    // Construct a dayjs object for the input date assuming it represents Chicago time
    const inputRef = dayjs.tz(dayjs(date).format('YYYY-MM-DD HH:mm:ss'), CHICAGO_TZ);

    return inputRef.isAfter(nowRef);
}

/**
 * Checks if a given Chicago-wall-clock Date is in the past relative to Chicago now.
 * @param date The JS Date object representing Chicago wall-clock time
 */
export function isBeforeChicagoNow(date: Date): boolean {
    const nowRef = dayjs().tz(CHICAGO_TZ);
    const inputRef = dayjs.tz(dayjs(date).format('YYYY-MM-DD HH:mm:ss'), CHICAGO_TZ);
    return inputRef.isBefore(nowRef);
}
