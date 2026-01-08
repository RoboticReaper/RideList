import { NextResponse } from 'next/server';
import { pool } from '@/app/api/lib/db';
import { verifyUserFromRequest } from '@/app/api/lib/verifyUser';
import { checkAndProcessCheckInStart } from '@/app/api/lib/checkIn';
import { checkAndProcessTripCutoff } from '@/app/api/lib/tripCutoff';
import { checkAndProcessPayWindowTimeout } from '@/app/api/lib/payWindow';
import { createNotification } from '@/app/api/lib/createNotification';
import { isPickupValid } from '@/app/api/lib/geoUtils';


export async function GET(
    req: Request,
    { params }: { params: Promise<{ rideId: string }> }
) {
    const { rideId } = await params;
    const client = await pool.connect();

    try {
        // 1️⃣ Authenticate
        const user = await verifyUserFromRequest(
            req.headers.get('authorization') ?? undefined
        );

        if (!user?.uid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 2️⃣ Fetch Trip Context (Status & End Time)
        // We need to know WHEN the trip ended to calculate the 24h phone window.
        const tripRes = await client.query(
            `SELECT 
                t.driver, 
                t.status,
                te.created_at as ended_at
             FROM trips t
             LEFT JOIN LATERAL (
                SELECT created_at 
                FROM trip_events 
                WHERE trip = t.id 
                AND event_type IN ('trip_completed', 'trip_cancelled', 'trip_aborted')
                ORDER BY created_at DESC 
                LIMIT 1
             ) te ON true
             WHERE t.id = $1`,
            [rideId]
        );

        if (tripRes.rowCount === 0) {
            return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
        }

        const trip = tripRes.rows[0];

        // 3️⃣ Verify Ownership
        if (trip.driver !== user.uid) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // 4️⃣ Fetch Bookings
        const query = `
          SELECT 
            b.id,
            b.rider as rider_id,
            b.status,
            b.seats_booked,
            b.paid,
            b.big_luggage,
            b.small_luggage,
            b.picked_up,
            b.picked_up_at,
            b.ready,
            b.ready_at,
            b.created_at,
            b.intended_payment_method,
            b.pickup_location_text,
            b.driver_note,
            b.rider_note,
            b.preferred_pickup_time,

            pg.name as rider_name,
            pg.photo_url as rider_photo_url,
            pg.phone as rider_phone, -- Fetch phone to apply logic later
            pr.rating_cached as rider_rating,
            pr.completed_rides as rider_completed_rides,

            br.reason as removal_reason

          FROM bookings b
          JOIN profile_global pg ON b.rider = pg.id
          LEFT JOIN profile_rider pr ON b.rider = pr.id
          LEFT JOIN booking_removal br ON b.id = br.bid
          WHERE b.trip = $1
          ORDER BY b.created_at DESC
        `;

        const res = await client.query(query, [rideId]);

        // 5️⃣ Permission Logic
        const now = new Date();
        const GRACE_PERIOD_MS = 24 * 60 * 60 * 1000; // 24 Hours

        // Helper: Is the trip currently happening?
        const isTripActive = ['bookable', 'locked', 'full', 'departed'].includes(trip.status);

        // Helper: Did the trip end recently?
        let isTripRecent = false;
        if (trip.ended_at) {
            const timeSinceEnd = now.getTime() - new Date(trip.ended_at).getTime();
            isTripRecent = timeSinceEnd < GRACE_PERIOD_MS;
        }

        const bookings = res.rows.map(row => {
            // A. Identity Rules (Name, Photo, Stats)
            // Rule: "The Receipt". If a booking existed and wasn't a glitch, 
            // the driver should always see WHO it was, even years later.
            // Includes: Joined, Confirmed, Completed, No-Show, Removed.
            const identityVisible = [
                'joined_with_pay_window',
                'pending_pay_confirmation_from_driver',
                'confirmed',
                'completed',
                'no_show',
                'removed', // Driver needs to see who they removed
                'left_paid',
                'left_unpaid'
            ].includes(row.status) || row.paid;

            // B. Contact Rules (Phone)
            // Rule: "Operational Window". Only visible if coordination is needed (Active)
            // or immediately after drop-off (Recent).
            // STRICTLY HIDDEN for Removed users.
            const isBookingActive = [
                'joined_with_pay_window',
                'pending_pay_confirmation_from_driver',
                'confirmed',
                'no_show'
            ].includes(row.status);

            let phoneVisible = false;

            if (row.status === 'removed') {
                phoneVisible = false; // Hard privacy block
            } else {
                // Case 1: Active Booking in Active Trip
                if (isBookingActive && isTripActive) {
                    phoneVisible = true;
                }
                // Case 2: Grace Period (Trip recently ended)
                // Applies to Active Bookings (e.g. Completed) AND Paid Cancellations (Refunds)
                else if (isTripRecent) {
                    if (isBookingActive) {
                        phoneVisible = true;
                    } else if (row.status === 'cancelled' && row.paid) {
                        phoneVisible = true; // Refund Window logic
                    }
                }
            }

            // C. Apply Redaction
            let displayName: string;
            if (identityVisible) {
                displayName = row.rider_name;
            } else {
                displayName = row.rider_name
                    ? row.rider_name.substring(0, 3) + '***'
                    : 'Anon';
            }

            return {
                id: row.id,
                status: row.status,
                seats_booked: row.seats_booked,
                big_luggage: row.big_luggage,
                small_luggage: row.small_luggage,
                ready: row.ready,
                ready_at: row.ready_at,
                picked_up: row.picked_up,
                picked_up_at: row.picked_up_at,
                created_at: row.created_at,
                intended_payment_method: row.intended_payment_method,

                rider_id: row.rider_id,

                // Identity
                rider_name: displayName,
                rider_photo_url: identityVisible ? row.rider_photo_url : null,
                rider_rating: row.rider_rating ?? null,
                rider_completed_rides: row.rider_completed_rides ?? 0,

                // Contact
                rider_phone: phoneVisible ? row.rider_phone : null,
                rider_phone_visible: phoneVisible
                    ? (row.rider_phone ? 'VISIBLE' : 'MISSING')
                    : 'REDACTED',

                removal_reason: row.removal_reason || null,
                // Pickup location and rider note use same redaction logic as phone
                pickup_location_text: phoneVisible ? (row.pickup_location_text || null) : null,
                driver_note: row.driver_note || null,
                rider_note: phoneVisible ? (row.rider_note || null) : null,
                preferred_pickup_time: row.preferred_pickup_time || null,
                // Status to help frontend distinguish between redacted and not provided
                pickup_info_visible: phoneVisible ? 'VISIBLE' : 'REDACTED'
            };
        });

        return NextResponse.json({ bookings });

    } catch (error: any) {
        console.error('Fetch Trip Bookings Error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    } finally {
        client.release();
    }
}


export async function POST(
    req: Request,
    { params }: { params: Promise<{ rideId: string }> }
) {
    const { rideId } = await params;
    const client = await pool.connect();

    try {
        const user = await verifyUserFromRequest(
            req.headers.get('authorization') ?? undefined
        );

        if (!user || !user.uid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { seats_booked, big_luggage, small_luggage, preferred_pickup_time, intended_payment_method, pickup_location_text, pickup_lat, pickup_lng, rider_note } = body;

        // Check for Global Profile
        const profileCheck = await client.query(
            "SELECT 1 FROM profile_global WHERE id = $1 LIMIT 1",
            [user.uid]
        );

        if (profileCheck.rowCount === 0) {
            return NextResponse.json({
                error: 'Profile required',
                code: 'PROFILE_REQUIRED'
            }, { status: 403 });
        }

        // Basic Validation
        if (!seats_booked || seats_booked < 1) {
            return NextResponse.json({ error: 'Must book at least 1 seat' }, { status: 400 });
        }
        if (!intended_payment_method) {
            return NextResponse.json({ error: 'Intended payment method is required' }, { status: 400 });
        }

        await client.query('BEGIN');

        // Lazy Cleanup of Timed Out Bookings
        const timeouts = await client.query(
            "SELECT id FROM bookings WHERE trip = $1 AND status = 'joined_with_pay_window'",
            [rideId]
        );
        for (const row of timeouts.rows) {
            await checkAndProcessPayWindowTimeout(client, row.id);
        }

        // Lazy Check-in Start
        await checkAndProcessCheckInStart(client, rideId);

        // Lazy Trip Cutoff Check
        await checkAndProcessTripCutoff(client, rideId);

        // Fetch Trip & Rules & Driver
        // Locking row for consistency
        const tripQuery = `
            SELECT 
                t.driver,
                t.total_seats,
                t.seats_taken,
                t.departure_time,
                t.status,
                ST_X(t.origin_geog::geometry) as origin_lng,
                ST_Y(t.origin_geog::geometry) as origin_lat,
                tr.big_luggage_lim,
                tr.small_luggage_lim,
                tr.auto_accept,
                tr.departure_time_flexibility,
                tr.cutoff_time,
                tr.pickup_rules,
                tr.pickup_radius_meters,
                tr.drop_off_radius_meters,
                tr.payment_methods,
                tr.payment_handle,
                tr.cancellation_policy,
                tr.pay_window,
                tr.start_check_in_hrs_before_departure
            FROM trips t
            LEFT JOIN trip_rules tr ON t.id = tr.id
            WHERE t.id = $1
            FOR UPDATE OF t
        `;
        const tripRes = await client.query(tripQuery, [rideId]);

        if (tripRes.rowCount === 0) {
            await client.query('ROLLBACK');
            return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
        }

        const trip = tripRes.rows[0];

        // 0. Check if trip is bookable
        if (trip.status !== 'bookable') {
            await client.query('ROLLBACK');
            return NextResponse.json({ error: 'Trip is not bookable' }, { status: 400 });
        }

        // 1. Check if user is driver
        if (trip.driver === user.uid) {
            await client.query('ROLLBACK');
            return NextResponse.json({ error: 'You cannot book your own trip' }, { status: 400 });
        }

        // 1.5 Check Cutoff Time
        if (trip.cutoff_time) {
            const now = new Date().getTime();
            const departure = new Date(trip.departure_time).getTime();

            // cutoff_time is an Interval object from Postgres (e.g. { hours: 1, minutes: 30 })
            const c = trip.cutoff_time;
            const days = c.days || 0;
            const hours = c.hours || 0;
            const minutes = c.minutes || 0;

            const cutoffMs = (days * 24 * 60 * 60 * 1000) +
                (hours * 60 * 60 * 1000) +
                (minutes * 60 * 1000);

            // Add flexibility to departure time
            let flexMs = 0;
            if (trip.departure_time_flexibility) {
                const f = trip.departure_time_flexibility;
                const fh = f.hours || 0;
                const fm = f.minutes || 0;
                flexMs = (fh * 60 * 60 * 1000) + (fm * 60 * 1000);
            }

            const cutoffPoint = departure + flexMs - cutoffMs;

            if (now > cutoffPoint) {
                await client.query('ROLLBACK');
                return NextResponse.json({ error: 'Booking for this trip has closed.' }, { status: 400 });
            }
        }

        // 2. Check seats available
        const seatsAvailable = trip.total_seats - trip.seats_taken;
        if (seats_booked > seatsAvailable) {
            await client.query('ROLLBACK');
            return NextResponse.json({ error: `Not enough seats. Only ${seatsAvailable} left.` }, { status: 400 });
        }

        // 3. Check luggage limits
        // Limits are PER PERSON (per seat booked)
        const totalBigAllowed = (trip.big_luggage_lim || 0) * seats_booked;
        const totalSmallAllowed = (trip.small_luggage_lim || 0) * seats_booked;


        if (big_luggage > totalBigAllowed) {
            await client.query('ROLLBACK');
            return NextResponse.json({ error: `Too many big bags. Max allowed for ${seats_booked} seats is ${totalBigAllowed}.` }, { status: 400 });
        }
        if (small_luggage > totalSmallAllowed) {
            await client.query('ROLLBACK');
            return NextResponse.json({ error: `Too many small bags. Max allowed for ${seats_booked} seats is ${totalSmallAllowed}.` }, { status: 400 });
        }

        // 4. Check pickup time flexibility
        if (preferred_pickup_time) {
            const originalTime = new Date(trip.departure_time).getTime();
            const preferredTime = new Date(preferred_pickup_time).getTime();

            // Parse flexibility (stored as JSON: { hours: number, minutes: number })
            let rangeMs = 15 * 60 * 1000; // Default 15 mins
            if (trip.departure_time_flexibility) {
                const f = trip.departure_time_flexibility;
                const h = f.hours || 0;
                const m = f.minutes || 0;
                rangeMs = (h * 60 * 60 * 1000) + (m * 60 * 1000);
            }

            const diff = Math.abs(preferredTime - originalTime);
            if (diff > rangeMs) {
                await client.query('ROLLBACK');
                return NextResponse.json({ error: 'Preferred pickup time is outside the driver\'s flexibility range.' }, { status: 400 });
            }
        }

        // 4.5 Check Pickup Location (Geo-fence)
        if (pickup_lat && pickup_lng) {
            const originLat = trip.origin_lat;
            const originLng = trip.origin_lng;
            const radius = trip.pickup_radius_meters || 5000; // Default 5km

            if (originLat && originLng) {
                const validation = isPickupValid(originLat, originLng, pickup_lat, pickup_lng, radius);
                if (!validation.isValid) {
                    await client.query('ROLLBACK');
                    return NextResponse.json({
                        error: `Pickup location is too far. Max radius is ${(radius / 1000).toFixed(1)}km.`
                    }, { status: 400 });
                }
            }
        }

        // 5. Check payment method
        const paymentMethods = trip.payment_methods || [];
        if (paymentMethods.length > 0) {
            if (!paymentMethods.includes(intended_payment_method)) {
                await client.query('ROLLBACK');
                return NextResponse.json({ error: `Invalid payment method. Must be one of: ${paymentMethods.join(', ')}` }, { status: 400 });
            }
        } else {
            if (intended_payment_method !== 'None') {
                await client.query('ROLLBACK');
                return NextResponse.json({ error: "Payment method must be 'None' when no methods are specified by driver." }, { status: 400 });
            }
        }


        // 6. Determine Status & Check Existing Bookings

        // Fetch USER's latest booking for this trip
        const invalidStatusCheck = await client.query(
            "SELECT status FROM bookings WHERE trip = $1 AND rider = $2 ORDER BY created_at DESC LIMIT 1",
            [rideId, user.uid]
        );

        // Default: undefined if never booked
        let existingStatus: string | undefined;
        if (invalidStatusCheck.rowCount && invalidStatusCheck.rowCount > 0) {
            existingStatus = invalidStatusCheck.rows[0].status;
        }

        // Constraints:
        // 1. If currently active, block.
        // Active = NOT (pay_timeout, removed, left_paid, left_unpaid, cancelled)
        // If it is NOT in the inactive list, it is ACTIVE.

        const inactiveStatuses = ['pay_timeout', 'removed', 'left_paid', 'left_unpaid', 'cancelled'];

        if (existingStatus) {
            if (existingStatus === 'cancelled') {
                await client.query('ROLLBACK');
                return NextResponse.json({ error: 'You cannot rejoin this trip.' }, { status: 400 });
            }

            if (!inactiveStatuses.includes(existingStatus)) {
                await client.query('ROLLBACK');
                return NextResponse.json({ error: 'You already have an active booking on this trip.' }, { status: 400 });
            }
        }

        let status = 'waiting_approval';

        // Auto-accept Check
        // If they were previously removed, do NOT auto-accept (safety)
        // Check if user was EVER removed from this trip
        const removedCheck = await client.query(
            "SELECT 1 FROM bookings WHERE trip = $1 AND rider = $2 AND status = 'removed' LIMIT 1",
            [rideId, user.uid]
        );
        const wasRemoved = removedCheck.rowCount ? removedCheck.rowCount > 0 : false;

        if (trip.auto_accept && !wasRemoved) {
            status = 'joined_with_pay_window';
        }


        // 7. Insert Booking
        const insertQuery = `
            INSERT INTO bookings (trip, rider, seats_booked, big_luggage, small_luggage, preferred_pickup_time, intended_payment_method, status, pickup_geog, pickup_location_text, rider_note)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 
                CASE WHEN $9::float IS NOT NULL AND $10::float IS NOT NULL 
                     THEN ST_SetSRID(ST_MakePoint($10, $9), 4326)::geography 
                     ELSE NULL END,
                $11, $12)
            RETURNING id
        `;

        const insertRes = await client.query(insertQuery, [
            rideId,
            user.uid,
            seats_booked,
            big_luggage || 0,
            small_luggage || 0,
            preferred_pickup_time || null,
            intended_payment_method,
            status,
            pickup_lat || null,
            pickup_lng || null,
            pickup_location_text || null,
            rider_note || null
        ]);

        let bookingId = insertRes.rows[0].id;

        // 7. Update Trip Seats (ONLY if auto-accepted)
        if (status === 'joined_with_pay_window') {
            const updateRes = await client.query(
                'UPDATE trips SET seats_taken = seats_taken + $1 WHERE id = $2 RETURNING seats_taken, total_seats, status',
                [seats_booked, rideId]
            );
            const { seats_taken, total_seats, status: tripStatus } = updateRes.rows[0];

            if (tripStatus === 'bookable' && seats_taken >= total_seats) {
                await client.query("UPDATE trips SET status = 'full', modified_at = NOW() WHERE id = $1", [rideId]);

                // Log Status Change (Bookable -> Full)
                const { logTripEvent } = await import('@/app/api/lib/tripEvents');
                await logTripEvent({
                    client,
                    tripId: rideId,
                    actorId: user.uid,
                    eventType: 'trip_updated',
                    affectedEntities: ['trips'],
                    changes: { trip: { status: { old: 'bookable', new: 'full' } } },
                    notes: `status change due to rider join.`
                });

                await createNotification({
                    client,
                    type: 'trip_full',
                    title: 'Trip Full',
                    message: 'Your trip is now full.',
                    userId: trip.driver,
                    entityType: 'trips',
                    entityId: rideId,
                    openLink: `/dashboard/${rideId}`,
                    role: 'driver'
                })
            }
        }

        // Notify Driver of New Booking
        if (status === 'joined_with_pay_window') {
            await createNotification({
                client,
                type: 'new_booking',
                title: 'New Rider Joined',
                message: 'A rider has joined your trip.',
                userId: trip.driver,
                entityType: 'bookings',
                entityId: bookingId,
                openLink: `/dashboard/${rideId}`,
                role: 'driver'
            });
        } else if (status === 'waiting_approval') {
            await createNotification({
                client,
                type: 'new_booking',
                title: 'New Booking Request',
                message: 'A rider has requested to join your trip.',
                userId: trip.driver,
                entityType: 'bookings',
                entityId: bookingId,
                openLink: `/dashboard/${rideId}`,
                role: 'driver'
            });
        }

        // 8. Create initial log in booking status history
        const statusHistoryQuery = `
            INSERT INTO booking_status_history (booking_id, actor_id, new_status, created_at)
            VALUES ($1, $2, $3, NOW())
        `;
        await client.query(statusHistoryQuery, [bookingId, user.uid, status]);

        // 9. Snapshot Rules
        const snapshotQuery = `
            INSERT INTO booking_rule_snapshot (
                id,
                big_luggage_lim,
                small_luggage_lim,
                pickup_rules,
                pickup_radius_meters,
                drop_off_radius_meters,
                departure_time_flexibility,
                payment_methods,
                payment_handle,
                cancellation_policy,
                auto_accept,
                cutoff_time,
                pay_window,
                start_check_in_hrs_before_departure
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        `;

        await client.query(snapshotQuery, [
            bookingId,
            trip.big_luggage_lim,
            trip.small_luggage_lim,
            trip.pickup_rules,
            trip.pickup_radius_meters,
            trip.drop_off_radius_meters,
            trip.departure_time_flexibility,
            trip.payment_methods,
            trip.payment_handle,
            trip.cancellation_policy,
            trip.auto_accept,
            trip.cutoff_time,
            trip.pay_window,
            trip.start_check_in_hrs_before_departure
        ]);

        await client.query('COMMIT');

        return NextResponse.json({
            success: true,
            bookingId: bookingId,
            status: status
        });

    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error("Create Booking Error:", error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    } finally {
        client.release();
    }
}
