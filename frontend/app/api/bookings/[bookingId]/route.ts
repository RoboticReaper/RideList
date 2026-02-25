import { NextResponse } from 'next/server';
import { pool } from '@/app/api/lib/db';
import { verifyUserFromRequest } from '@/app/api/lib/verifyUser';
import { checkAndProcessPayWindowTimeout } from '@/app/api/lib/payWindow';
import { checkAndProcessCheckInStart } from '@/app/api/lib/checkIn';
import { createNotification } from '../../lib/createNotification';
import { logTripEvent } from '@/app/api/lib/tripEvents';
import { isPickupValid } from '@/app/api/lib/geoUtils';
import { getTranslationForUser } from '@/app/api/lib/i18n';

export async function PATCH(
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

        const body = await req.json();

        await client.query('BEGIN');

        // Lazy Timeout Check
        await checkAndProcessPayWindowTimeout(client, bookingId);

        // Fetch Booking & Trip details with locking
        // We lock the trip row to ensure seat counts don't race
        const query = `
            SELECT 
                b.id,
                b.status,
                b.seats_booked,
                b.rider,
                b.rider_note,
                b.intended_payment_method,
                b.preferred_pickup_time,
                t.id as trip_id,
                t.driver,
                t.seats_taken,
                t.total_seats,
                t.status as trip_status,
                t.start_check_in,
                t.from_text,
                ST_X(t.origin_geog::geometry) as origin_lng,
                ST_Y(t.origin_geog::geometry) as origin_lat,
                t.departure_time,
                tr.departure_time_flexibility,
                tr.payment_methods,
                tr.big_luggage_lim,
                tr.small_luggage_lim,
                tr.big_luggage_paid,
                tr.small_luggage_paid,
                tr.big_luggage_paid_price,
                tr.small_luggage_paid_price,
                tr.pickup_radius_meters
            FROM bookings b
            JOIN trips t ON b.trip = t.id
            LEFT JOIN trip_rules tr ON t.id = tr.id
            WHERE b.id = $1
            FOR UPDATE OF t
        `;

        const res = await client.query(query, [bookingId]);

        if (res.rowCount === 0) {
            await client.query('ROLLBACK');
            return NextResponse.json({ error: t('api.errors.bookingNotFound') }, { status: 404 });
        }

        const booking = res.rows[0];

        // Lazy Check-in Start
        await checkAndProcessCheckInStart(client, booking.trip_id);

        // Global Read-Only Check for Trip Status
        const readOnlyTripStatuses = ['done', 'cancelled', 'aborted'];
        if (readOnlyTripStatuses.includes(booking.trip_status)) {
            await client.query('ROLLBACK');
            return NextResponse.json({ error: t('api.errors.tripReadOnly') }, { status: 400 });
        }

        // ============================================
        // BRANCH: Driver actions vs Rider updates
        // ============================================

        const isDriver = booking.driver === user.uid;
        const isRider = booking.rider === user.uid;

        if (!isDriver && !isRider) {
            await client.query('ROLLBACK');
            return NextResponse.json({ error: t('api.errors.forbidden') }, { status: 403 });
        }

        // ============================================
        // RIDER BRANCH: Update booking details
        // ============================================
        if (isRider) {
            const { rider_note, pickup_location_text, pickup_lat, pickup_lng, intended_payment_method, preferred_pickup_time, seats_booked, big_luggage, small_luggage } = body;

            // Check booking is in an editable status
            const editableStatuses = ['waiting_approval', 'joined_with_pay_window', 'pending_pay_confirmation_from_driver', 'confirmed'];
            if (!editableStatuses.includes(booking.status)) {
                await client.query('ROLLBACK');
                return NextResponse.json({ error: t('api.errors.bookingNotEditable') }, { status: 400 });
            }

            // Check if trip is departed (Rider cannot edit after departure)
            if (booking.trip_status === 'departed') {
                await client.query('ROLLBACK');
                return NextResponse.json({ error: t('api.errors.bookingTripDeparted') }, { status: 400 });
            }

            // Validate intended payment method if provided
            if (intended_payment_method !== undefined) {
                const paymentMethods: string[] = booking.payment_methods || [];
                if (paymentMethods.length > 0 && !paymentMethods.includes(intended_payment_method)) {
                    await client.query('ROLLBACK');
                    return NextResponse.json({ error: t('api.errors.invalidPaymentMethod', { methods: 'any' }) }, { status: 400 });
                }
            }

            // SEATS & LUGGAGE VALIDATION
            // These fields can only be edited in specific statuses
            const seatingEditableStatuses = ['waiting_approval', 'joined_with_pay_window', 'pending_pay_confirmation_from_driver'];
            const isEditingSeating = seats_booked !== undefined || big_luggage !== undefined || small_luggage !== undefined;

            if (isEditingSeating) {
                if (!seatingEditableStatuses.includes(booking.status)) {
                    await client.query('ROLLBACK');
                    return NextResponse.json({ error: t('api.errors.seatsLocked') }, { status: 400 });
                }

                // Effective new values (or default to current)
                const newSeats = seats_booked === undefined ? booking.seats_booked : seats_booked;
                const newBig = big_luggage === undefined ? booking.big_luggage : big_luggage;
                const newSmall = small_luggage === undefined ? booking.small_luggage : small_luggage;

                // Validate Seats
                if (newSeats < 1) {
                    await client.query('ROLLBACK');
                    return NextResponse.json({ error: t('api.errors.minSeats') }, { status: 400 });
                }

                // Check Capacity
                // If booking status is waiting_approval, seats are NOT in seats_taken yet.
                // If booking status is joined_... or pending_..., seats ARE in seats_taken.
                let available = 0;
                const isSeatsCounted = ['joined_with_pay_window', 'pending_pay_confirmation_from_driver'].includes(booking.status);

                if (isSeatsCounted) {
                    available = (booking.total_seats - booking.seats_taken) + booking.seats_booked; // Release own seats for check
                } else {
                    available = booking.total_seats - booking.seats_taken;
                }

                if (newSeats > available) {
                    await client.query('ROLLBACK');
                    return NextResponse.json({ error: t('api.errors.notEnoughSeats', { count: available }) }, { status: 400 });
                }

                // Validate Luggage Limits
                // Limits are per PERSON (based on assumption in prompt "limit per person")

                const maxBig = ((booking.big_luggage_lim || 0) + (booking.big_luggage_paid || 0)) * newSeats;
                const maxSmall = ((booking.small_luggage_lim || 0) + (booking.small_luggage_paid || 0)) * newSeats;

                if (newBig > maxBig) {
                    await client.query('ROLLBACK');
                    return NextResponse.json({ error: t('api.errors.luggageLimit', { type: 'big', limit: maxBig, seats: newSeats }) }, { status: 400 });
                }
                if (newSmall > maxSmall) {
                    await client.query('ROLLBACK');
                    return NextResponse.json({ error: t('api.errors.luggageLimit', { type: 'small', limit: maxSmall, seats: newSeats }) }, { status: 400 });
                }
            }

            // Validate pickup location - if text provided, coords should also be provided
            if (pickup_location_text && (pickup_lat === undefined || pickup_lat === null || pickup_lng === undefined || pickup_lng === null)) {
                await client.query('ROLLBACK');
                return NextResponse.json({ error: t('api.errors.invalidPickupLocation') }, { status: 400 });
            }

            // VALIDATE PICKUP RADIUS (If Location Changed)
            if (pickup_lat !== undefined && pickup_lat !== null && pickup_lng !== undefined && pickup_lng !== null) {
                const originLat = booking.origin_lat;
                const originLng = booking.origin_lng;
                const radius = booking.pickup_radius_meters || 5000;

                if (originLat && originLng) {
                    const validation = isPickupValid(originLat, originLng, pickup_lat, pickup_lng, radius);
                    if (!validation.isValid) {
                        await client.query('ROLLBACK');
                        return NextResponse.json({
                            error: t('api.errors.pickupTooFar')
                        }, { status: 400 });
                    }
                }
            }

            // Helpers for robust comparison
            const normalizeString = (val: any) => (val || '').trim();
            const areStringsDifferent = (a: any, b: any) => normalizeString(a) !== normalizeString(b);

            // Round to nearest minute to avoid seconds/ms mismatches
            const normalizeTime = (val: any) => {
                if (!val) return null;
                const date = new Date(val);
                if (isNaN(date.getTime())) return null;
                // Round to nearest minute (60000ms)
                return Math.round(date.getTime() / 60000) * 60000;
            };
            const areTimesDifferent = (a: any, b: any) => normalizeTime(a) !== normalizeTime(b);

            // Build update query dynamically
            const updates: string[] = [];
            const values: any[] = [];
            const changes: string[] = []; // To track what changed for notification
            const mutationChanges: Record<string, { old: any, new: any }> = {}; // For mutation log
            let idx = 1;

            if (rider_note !== undefined) {
                // If it's different, we update. 
                // We use the normalized version for comparison but store the raw input (or trimmed if desired, but raw is fine if we just want to avoid false notification)
                // Actually, let's store the trimmed version to keep DB clean too.
                const newVal = (rider_note || '').trim() || null;
                updates.push(`rider_note = $${idx++}`);
                values.push(newVal);

                if (areStringsDifferent(booking.rider_note, newVal)) {
                    changes.push('Pickup Note');
                    mutationChanges['rider_note'] = { old: booking.rider_note, new: newVal };
                }
            }

            if (pickup_location_text !== undefined) {
                const newVal = (pickup_location_text || '').trim() || null;
                updates.push(`pickup_location_text = $${idx++}`);
                values.push(newVal);

                if (areStringsDifferent(booking.pickup_location_text, newVal)) {
                    changes.push('Pickup Location');
                    mutationChanges['pickup_location_text'] = { old: booking.pickup_location_text, new: newVal };
                }
            }

            if (pickup_lat !== undefined && pickup_lng !== undefined) {
                if (pickup_lat !== null && pickup_lng !== null) {
                    updates.push(`pickup_geog = ST_SetSRID(ST_MakePoint($${idx++}, $${idx++}), 4326)`);
                    values.push(pickup_lng); // Note: MakePoint takes (lng, lat)
                    values.push(pickup_lat);
                } else {
                    updates.push(`pickup_geog = NULL`);
                }
                // Location text change covers the notification aspect
            }

            if (intended_payment_method !== undefined) {
                const newVal = (intended_payment_method || '').trim() || null;
                updates.push(`intended_payment_method = $${idx++}`);
                values.push(newVal);

                if (areStringsDifferent(booking.intended_payment_method, newVal)) {
                    changes.push('Payment Method');
                    mutationChanges['intended_payment_method'] = { old: booking.intended_payment_method, new: newVal };
                }
            }

            if (preferred_pickup_time !== undefined) {
                // Check flexibility validation
                const parseFlexibility = (interval: any): number => {
                    // Returns milliseconds
                    if (!interval) return 15 * 60 * 1000; // Default 15 mins

                    // If postgres object
                    if (typeof interval === 'object') {
                        return ((interval.hours || 0) * 3600 + (interval.minutes || 0) * 60 + (interval.seconds || 0)) * 1000;
                    }

                    // If string HH:MM:SS
                    if (typeof interval === 'string' && interval.includes(':')) {
                        const p = interval.split(':');
                        return (parseInt(p[0] || '0') * 3600 + parseInt(p[1] || '0') * 60 + parseInt(p[2] || '0')) * 1000;
                    }
                    return 15 * 60 * 1000;
                };

                const flexMs = parseFlexibility(booking.departure_time_flexibility);
                const departureTime = new Date(booking.departure_time).getTime();

                let newTimeVal = null;

                if (preferred_pickup_time) {
                    const chosenTime = new Date(preferred_pickup_time).getTime();
                    if (isNaN(chosenTime)) {
                        await client.query('ROLLBACK');
                        return NextResponse.json({ error: t('api.errors.invalidPickupTimeFormat') }, { status: 400 });
                    }

                    // Check range: departure - flex <= chosen <= departure + flex
                    if (Math.abs(chosenTime - departureTime) > flexMs) {
                        await client.query('ROLLBACK');
                        return NextResponse.json({ error: t('api.errors.flexibilityExceeded') }, { status: 400 });
                    }
                    newTimeVal = preferred_pickup_time;
                }

                updates.push(`preferred_pickup_time = $${idx++}`);
                values.push(newTimeVal);

                if (areTimesDifferent(booking.preferred_pickup_time, newTimeVal)) {
                    changes.push('Preferred Pickup Time');
                    mutationChanges['preferred_pickup_time'] = { old: booking.preferred_pickup_time, new: newTimeVal };
                }
            }

            if (seats_booked !== undefined) {
                updates.push(`seats_booked = $${idx++}`);
                values.push(seats_booked);
                if (booking.seats_booked !== seats_booked) {
                    changes.push('Seats Booked');
                    mutationChanges['seats_booked'] = { old: booking.seats_booked, new: seats_booked };
                }
            }

            if (big_luggage !== undefined) {
                updates.push(`big_luggage = $${idx++}`);
                values.push(big_luggage);
                if (booking.big_luggage !== big_luggage) {
                    changes.push('Big Luggage');
                    mutationChanges['big_luggage'] = { old: booking.big_luggage, new: big_luggage };
                }
            }

            if (small_luggage !== undefined) {
                updates.push(`small_luggage = $${idx++}`);
                values.push(small_luggage);
                if (booking.small_luggage !== small_luggage) {
                    changes.push('Small Luggage');
                    mutationChanges['small_luggage'] = { old: booking.small_luggage, new: small_luggage };
                }
            }

            if (updates.length === 0) {
                await client.query('ROLLBACK');
                return NextResponse.json({ error: t('api.errors.noUpdateFields') }, { status: 400 });
            }

            // RATE LIMIT CHECK
            // If we are making a mutation (tracked change), enforce 5 min cooldown
            // ONLY if check-in has started
            if (booking.start_check_in && Object.keys(mutationChanges).length > 0) {
                const lastMutationRes = await client.query(
                    `SELECT created_at FROM booking_mutations 
                     WHERE booking_id = $1 AND actor = $2 
                     ORDER BY created_at DESC LIMIT 1`,
                    [bookingId, user.uid]
                );

                if (lastMutationRes.rows.length > 0) {
                    const lastMutationTime = new Date(lastMutationRes.rows[0].created_at).getTime();
                    const now = Date.now();
                    const diffMins = (now - lastMutationTime) / (1000 * 60);

                    if (diffMins < 5) {
                        await client.query('ROLLBACK');
                        const remaining = Math.ceil(5 - diffMins);
                        return NextResponse.json(
                            { error: t('api.errors.rateLimit') },
                            { status: 429 }
                        );
                    }
                }
            }

            values.push(bookingId);
            await client.query(
                `UPDATE bookings SET ${updates.join(', ')} WHERE id = $${idx}`,
                values
            );

            // Update Trip Seats if needed
            if (seats_booked !== undefined && booking.seats_booked !== seats_booked) {
                const isSeatsCounted = ['joined_with_pay_window', 'pending_pay_confirmation_from_driver'].includes(booking.status);
                if (isSeatsCounted) {
                    const diff = seats_booked - booking.seats_booked;
                    const tripRes = await client.query(
                        'UPDATE trips SET seats_taken = seats_taken + $1 WHERE id = $2 RETURNING status, seats_taken, total_seats',
                        [diff, booking.trip_id]
                    );

                    if (tripRes.rows.length > 0) {
                        const tr = tripRes.rows[0];
                        let newTripStatus = tr.status;
                        if (tr.seats_taken >= tr.total_seats && tr.status === 'bookable') {
                            newTripStatus = 'full';
                        } else if (tr.seats_taken < tr.total_seats && tr.status === 'full') {
                            newTripStatus = 'bookable';
                        }

                        if (newTripStatus !== tr.status) {
                            await client.query('UPDATE trips SET status = $1, modified_at = NOW() WHERE id = $2', [newTripStatus, booking.trip_id]);
                        }
                    }
                }
            }

            // LOG MUTATION
            if (Object.keys(mutationChanges).length > 0) {
                await client.query(
                    `INSERT INTO booking_mutations (booking_id, actor, change) VALUES ($1, $2, $3)`,
                    [bookingId, user.uid, JSON.stringify(mutationChanges)]
                );
            }

            // NOTIFICATION LOGIC
            // Only notify if booking is confirmed or pending payment
            const notifyStatuses = ['pending_pay_confirmation_from_driver', 'confirmed'];
            if (booking.start_check_in && notifyStatuses.includes(booking.status) && changes.length > 0) {
                await createNotification({
                    client,
                    type: 'booking_updated',
                    titleKey: 'notifications.types.booking_updated.title',
                    messageKey: 'notifications.types.booking_updated.message',
                    userId: booking.driver,
                    entityType: 'bookings',
                    entityId: bookingId,
                    openLink: `/dashboard/${booking.trip_id}`,
                    role: 'driver'
                });
            }

            await client.query('COMMIT');
            return NextResponse.json({ success: true, changes });
        }

        // ============================================
        // DRIVER BRANCH: Booking actions
        // ============================================
        const { action, reason, driver_note } = body;

        // Allow updating driver note without a specific action state transition
        if (driver_note !== undefined) {
            await client.query(
                'UPDATE bookings SET driver_note = $1 WHERE id = $2',
                [driver_note, bookingId]
            );

            // If that was the only thing, we are done
            if (!action) {
                await client.query('COMMIT');
                return NextResponse.json({ success: true });
            }
        }

        if (!['accept', 'reject', 'remove', 'confirm_payment', 'mark_picked_up'].includes(action)) {
            await client.query('ROLLBACK');
            return NextResponse.json({ error: t('api.errors.invalidAction') }, { status: 400 });
        }

        let newStatus = '';
        let seatsChange = 0;

        // State Machine Logic
        switch (action) {
            case 'accept':
                if (booking.status !== 'waiting_approval') {
                    await client.query('ROLLBACK');
                    return NextResponse.json({ error: t('api.errors.bookingNotWaiting') }, { status: 400 });
                }

                // STRICT LIMIT CHECK
                if (booking.seats_taken + booking.seats_booked > booking.total_seats) {
                    await client.query('ROLLBACK');
                    return NextResponse.json({ error: t('api.errors.notEnoughSeatsAccept') }, { status: 400 });
                }

                newStatus = 'joined_with_pay_window';
                seatsChange = booking.seats_booked;

                await createNotification({
                    client,
                    type: 'pay_window_started',
                    titleKey: 'notifications.types.pay_window_started.title',
                    messageKey: 'notifications.types.pay_window_started.message',
                    userId: booking.rider,
                    entityType: 'bookings',
                    entityId: bookingId,
                    openLink: `/dashboard/${booking.trip_id}`,
                    role: 'rider'
                })
                break;

            case 'reject':
                if (booking.status !== 'waiting_approval') {
                    await client.query('ROLLBACK');
                    return NextResponse.json({ error: t('api.errors.bookingNotWaiting') }, { status: 400 });
                }
                newStatus = 'removed';
                seatsChange = 0; // Seats were never taken

                await createNotification({
                    client,
                    type: 'booking_rejected',
                    titleKey: 'notifications.types.booking_rejected.title',
                    messageKey: 'notifications.types.booking_rejected.message',
                    userId: booking.rider,
                    entityType: 'bookings',
                    entityId: bookingId,
                    openLink: `/dashboard/${booking.trip_id}`,
                    role: 'rider'
                })
                break;

            case 'remove':
                if (booking.status === 'confirmed' && (booking.trip_status === 'departed' || readOnlyTripStatuses.includes(booking.trip_status))) {
                    await client.query('ROLLBACK');
                    return NextResponse.json({ error: t('api.errors.cannotRemoveConfirmed') }, { status: 400 });
                }

                if (booking.status === 'joined_with_pay_window' || booking.status === 'pending_pay_confirmation_from_driver' || booking.status === 'confirmed') {
                    newStatus = 'removed';
                    seatsChange = -booking.seats_booked; // Release seats

                    await createNotification({
                        client,
                        type: 'booking_removed',
                        titleKey: 'notifications.types.booking_removed.title',
                        messageKey: 'notifications.types.booking_removed.message',
                        userId: booking.rider,
                        entityType: 'bookings',
                        entityId: bookingId,
                        openLink: `/dashboard/${booking.trip_id}`,
                        role: 'rider'
                    })
                } else if (booking.status === 'waiting_approval') {
                    // Similar to reject
                    newStatus = 'removed';
                    seatsChange = 0;

                    await createNotification({
                        client,
                        type: 'booking_removed',
                        titleKey: 'notifications.types.booking_removed.title',
                        messageKey: 'notifications.types.booking_removed.message',
                        userId: booking.rider,
                        entityType: 'bookings',
                        entityId: bookingId,
                        openLink: `/dashboard/${booking.trip_id}`,
                        role: 'rider'
                    })
                } else {
                    await client.query('ROLLBACK');
                    return NextResponse.json({ error: t('api.errors.cannotRemoveStatus') }, { status: 400 });
                }
                break;

            case 'confirm_payment':
                if (booking.status !== 'pending_pay_confirmation_from_driver') {
                    await client.query('ROLLBACK');
                    return NextResponse.json({ error: t('api.errors.notPendingPayment') }, { status: 400 });
                }
                newStatus = 'confirmed';
                seatsChange = 0; // Seats already taken

                await createNotification({
                    client,
                    type: 'booking_confirmed',
                    titleKey: 'notifications.types.booking_confirmed.title',
                    messageKey: 'notifications.types.booking_confirmed.message',
                    userId: booking.rider,
                    entityType: 'bookings',
                    entityId: bookingId,
                    openLink: `/dashboard/${booking.trip_id}`,
                    role: 'rider'
                })
                break;

            case 'mark_picked_up':
                if (booking.status !== 'confirmed') {
                    await client.query('ROLLBACK');
                    return NextResponse.json({ error: t('api.errors.mustBeConfirmed') }, { status: 400 });
                }
                // Check trip status, it must be 'departed'
                // We fetched t.status as trip_status
                if (booking.trip_status !== 'departed') {
                    await client.query('ROLLBACK');
                    return NextResponse.json({ error: t('api.errors.tripMustBeDeparted') }, { status: 400 });
                }

                newStatus = booking.status;
                seatsChange = 0;

                // We need to perform the specific update for picked_up
                await client.query(
                    'UPDATE bookings SET picked_up = true, picked_up_at = NOW() WHERE id = $1',
                    [bookingId]
                );

                await createNotification({
                    client,
                    type: 'picked_up',
                    titleKey: 'notifications.types.picked_up.title',
                    messageKey: 'notifications.types.picked_up.message',
                    userId: booking.rider,
                    entityType: 'bookings',
                    entityId: bookingId,
                    openLink: `/dashboard/${booking.trip_id}`,
                    role: 'rider'
                })
                break;
        }

        // Apply Updates

        // 1. Update Booking Status
        await client.query(
            'UPDATE bookings SET status = $1 WHERE id = $2',
            [newStatus, bookingId]
        );

        // 2. Update Trip Seats (if changed)
        if (seatsChange !== 0) {
            const releaseRes = await client.query(
                'UPDATE trips SET seats_taken = seats_taken + $1 WHERE id = $2 RETURNING status, seats_taken, total_seats',
                [seatsChange, booking.trip_id]
            );

            if (releaseRes.rows.length > 0 && releaseRes.rows[0].status === 'full') {
                await client.query("UPDATE trips SET status = 'bookable', modified_at = NOW() WHERE id = $1", [booking.trip_id]);

                // Log Status Change (Full -> Bookable)
                await logTripEvent({
                    client,
                    tripId: booking.trip_id,
                    actorId: null,
                    eventType: 'trip_updated',
                    affectedEntities: ['trips'],
                    changes: { trip: { status: { old: 'full', new: 'bookable' } } },
                    notes: `status change due to driver removing booking with id ${bookingId}`
                });

                // Check cutoff immediately
                const { checkAndProcessTripCutoff } = await import('@/app/api/lib/tripCutoff');
                await checkAndProcessTripCutoff(client, booking.trip_id);
            }
        }

        // 3. Log Status History
        if (booking.status !== newStatus) {
            await client.query(
                `INSERT INTO booking_status_history (booking_id, actor_id, old_status, new_status)
                 VALUES ($1, $2, $3, $4)`,
                [bookingId, user.uid, booking.status, newStatus]
            );
        }

        // 4. Log Removal Reason (if removed)
        if (newStatus === 'removed') {
            let reasonText = reason;
            if (!reasonText) {
                reasonText = action === 'reject' ? 'Booking rejected by driver' : 'Removed by driver';
            }
            await client.query(
                `INSERT INTO booking_removal (bid, actor_id, reason)
                 VALUES ($1, $2, $3)`,
                [bookingId, user.uid, reasonText]
            );
        }

        // 5. Update paid column to true if confirmed
        if (newStatus === 'confirmed') {
            await client.query(
                'UPDATE bookings SET paid = true WHERE id = $1',
                [bookingId]
            );
        }

        await client.query('COMMIT');

        return NextResponse.json({ success: true, status: newStatus });

    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error("Booking Action Error:", error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    } finally {
        client.release();
    }
}

