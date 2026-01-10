import { NextResponse } from 'next/server';
import { pool } from '@/app/api/lib/db';
import { verifyUserFromRequest } from '@/app/api/lib/verifyUser';
import { checkAndProcessCheckInStart } from '@/app/api/lib/checkIn';
import { checkAndProcessTripCutoff } from '@/app/api/lib/tripCutoff';
import { createNotification } from '@/app/api/lib/createNotification';
import { getTranslationForUser } from '@/app/api/lib/i18n';

export async function POST(
    req: Request,
    { params }: { params: Promise<{ bookingId: string }> }
) {
    const { bookingId } = await params;
    const client = await pool.connect();

    try {
        const user = await verifyUserFromRequest(
            req.headers.get('authorization') ?? undefined
        );

        const t = await getTranslationForUser(user?.uid ?? null, client);

        if (!user || !user.uid) {
            return NextResponse.json({ error: t('api.errors.unauthorized') }, { status: 401 });
        }

        await client.query('BEGIN');

        // Check booking ownership and current status
        const bookingQuery = `
            SELECT b.id, b.rider, b.trip, b.status, b.ready
            FROM bookings b
            WHERE b.id = $1
            FOR UPDATE
        `;
        const bookingRes = await client.query(bookingQuery, [bookingId]);

        if (bookingRes.rowCount === 0) {
            await client.query('ROLLBACK');
            return NextResponse.json({ error: t('api.errors.bookingNotFound') }, { status: 404 });
        }

        const booking = bookingRes.rows[0];

        // Access checks
        if (booking.rider !== user.uid) {
            await client.query('ROLLBACK');
            return NextResponse.json({ error: t('api.errors.forbidden') }, { status: 403 });
        }

        // Lazy updates for trip state
        await checkAndProcessCheckInStart(client, booking.trip);
        await checkAndProcessTripCutoff(client, booking.trip);

        // Fetch fresh trip status
        const tripQuery = `
            SELECT status, start_check_in, departure_time, driver
            FROM trips
            WHERE id = $1
            FOR UPDATE
        `;
        const tripRes = await client.query(tripQuery, [booking.trip]);
        if (tripRes.rowCount === 0) {
            await client.query('ROLLBACK');
            return NextResponse.json({ error: t('api.errors.tripNotFound') }, { status: 404 });
        }
        const trip = tripRes.rows[0];

        // Validations
        // 1. Trip status
        if (trip.status === 'done' || trip.status === 'cancelled') {
            await client.query('ROLLBACK');
            return NextResponse.json({ error: t('api.errors.tripCompletedOrCancelled') }, { status: 400 });
        }

        // 2. Booking status
        if (booking.status !== 'confirmed' && booking.status !== 'pending_pay_confirmation_from_driver') {
            await client.query('ROLLBACK');
            return NextResponse.json({ error: t('api.errors.notConfirmedOrPending') }, { status: 400 });
        }

        // 3. Check-in enabled
        if (!trip.start_check_in) {
            await client.query('ROLLBACK');
            return NextResponse.json({ error: t('api.errors.checkInNotStarted') }, { status: 400 });
        }

        // 4. Already ready
        if (booking.ready) {
            await client.query('ROLLBACK');
            return NextResponse.json({ error: t('api.errors.alreadyReady') }, { status: 400 });
        }

        // Update
        const updateQuery = `
            UPDATE bookings
            SET ready = true, ready_at = NOW()
            WHERE id = $1
        `;
        await client.query(updateQuery, [bookingId]);

        await createNotification({
            client,
            type: 'rider_ready',
            titleKey: 'notifications.types.rider_ready.title',
            messageKey: 'notifications.types.rider_ready.message',
            userId: trip.driver,
            entityType: 'bookings',
            entityId: bookingId,
            openLink: `/dashboard/${booking.trip}`,
            role: 'driver'
        })

        await client.query('COMMIT');

        return NextResponse.json({ success: true });

    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error("Mark Ready Error:", error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    } finally {
        client.release();
    }
}
