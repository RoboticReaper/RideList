import { NextResponse } from 'next/server';
import { pool } from '@/app/api/lib/db';
import { verifyUserFromRequest } from '@/app/api/lib/verifyUser';
import { checkAndProcessPayWindowTimeout } from '@/app/api/lib/payWindow';
import { checkAndProcessCheckInStart } from '@/app/api/lib/checkIn';
import { checkAndProcessTripCutoff } from '@/app/api/lib/tripCutoff';

export async function GET(
    req: Request,
    { params }: { params: Promise<{ rideId: string }> }
) {
    const { rideId } = await params;
    const client = await pool.connect();

    try {
        let user = null;
        let userId = null;
        try {
            user = await verifyUserFromRequest(req.headers.get('authorization') ?? undefined);
            userId = user?.uid || null;
        } catch (e) {
            // Continue as guest
        }

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

        const query = `
      SELECT 
        -- Trip Info
        t.id,
        t.price,
        t.notes,
        t.from_text,
        t.to_text,
        t.departure_time,
        t.total_seats,
        t.seats_taken,
        t.status,
        t.start_check_in,
        t.created_at,
        t.modified_at,
        tc.created_at as trip_end_event_at,
        
        -- Rule Info
        tr.big_luggage_lim,
        tr.small_luggage_lim,
        tr.pickup_rules,
        tr.pickup_radius_meters,
        tr.drop_off_radius_meters,
        tr.departure_time_flexibility,
        tr.payment_methods,
        tr.cancellation_policy,
        tr.payment_handle,
        tr.auto_accept,
        tr.cutoff_time,
        tr.pay_window,
        tr.start_check_in_hrs_before_departure,
        
        -- Car Info (Strict Snapshot if Departed/Done)
        CASE 
            WHEN (t.status in ('departed', 'done', 'aborted')) THEN cs.original_car_id 
            ELSE c.id 
        END as car_id,
        CASE 
            WHEN (t.status in ('departed', 'done', 'aborted')) THEN cs.make 
            ELSE c.make 
        END as car_make,
        CASE 
            WHEN (t.status in ('departed', 'done', 'aborted')) THEN cs.model 
            ELSE c.model 
        END as car_model,
        CASE 
            WHEN (t.status in ('departed', 'done', 'aborted')) THEN cs.color 
            ELSE c.color 
        END as car_color,
        CASE 
            WHEN (t.status in ('departed', 'done', 'aborted')) THEN cs.year 
            ELSE c.year 
        END as car_year,
        CASE 
            WHEN (t.status in ('departed', 'done', 'aborted')) THEN cs.plate 
            ELSE c.plate 
        END as car_plate,
        
        -- Driver Info
        pg.id as driver_id,
        pg.name as driver_name,
        pg.verified as driver_verified,
        pg.photo_url as driver_photo_url,
        pg.phone as driver_phone,
        pg.created_at as driver_since,
        pd.rating_cached as driver_rating,
        pd.completed_trips as driver_completed_trips,

        -- Booking Info (User specific)
        ub.status as user_booking_status,
        ub.seats_booked as user_seats_booked,
        ub.big_luggage as user_big_luggage,
        ub.small_luggage as user_small_luggage,
        ub.paid as user_paid,
        ub.ready as user_ready,
        ub.ready_at as user_ready_at,
        ub.preferred_pickup_time as user_preferred_pickup_time,
        ub.created_at as user_booking_created_at,
        ub.id as user_booking_id,
        br.created_at as user_removed_at,
        ub.picked_up_at as user_picked_up_at,
        ub.intended_payment_method as user_intended_payment_method,

        -- Snapshot Rules (for this booking)
        brs.big_luggage_lim as snapshot_big_luggage_lim,
        brs.small_luggage_lim as snapshot_small_luggage_lim,
        brs.pickup_rules as snapshot_pickup_rules,
        brs.pickup_radius_meters as snapshot_pickup_radius_meters,
        brs.drop_off_radius_meters as snapshot_drop_off_radius_meters,
        brs.departure_time_flexibility as snapshot_departure_time_flexibility,
        brs.payment_methods as snapshot_payment_methods,
        brs.payment_handle as snapshot_payment_handle,
        brs.cancellation_policy as snapshot_cancellation_policy,
        brs.auto_accept as snapshot_auto_accept,
        brs.cutoff_time as snapshot_cutoff_time,
        brs.pay_window as snapshot_pay_window,
        brs.start_check_in_hrs_before_departure as snapshot_start_check_in_hrs_before_departure

      FROM trips t
      LEFT JOIN trip_rules tr ON t.id = tr.id
      LEFT JOIN cars c ON t.car = c.id
      LEFT JOIN car_snapshots cs ON t.id = cs.id
      LEFT JOIN profile_global pg ON t.driver = pg.id
      LEFT JOIN profile_driver pd ON t.driver = pd.id
      LEFT JOIN LATERAL (
        SELECT id, status, seats_booked, big_luggage, small_luggage, paid, ready, ready_at, preferred_pickup_time, created_at, picked_up_at, intended_payment_method
        FROM bookings b 
        WHERE b.trip = t.id AND b.rider = $2 
        ORDER BY b.created_at DESC 
        LIMIT 1
      ) ub ON true
      LEFT JOIN booking_removal br ON ub.id = br.bid
      LEFT JOIN booking_rule_snapshot brs ON ub.id = brs.id
      LEFT JOIN LATERAL (
        SELECT created_at
        FROM trip_events
        WHERE trip = t.id AND event_type in ('trip_cancelled', 'trip_aborted')
        ORDER BY created_at DESC
        LIMIT 1
      ) tc ON true
      WHERE t.id = $1
    `;

        const result = await client.query(query, [rideId, userId]);

        if (result.rowCount === 0) {
            return NextResponse.json({ error: 'Ride not found' }, { status: 404 });
        }

        const row = result.rows[0];

        // Auth check for driver view
        // user is already verified above
        const isDriver = user && user.uid === row.driver_id;
        const hasBooking = !!row.user_booking_id;

        // --- Redaction Logic ---
        // limit sensitive info access
        let finalAccess = false;
        const fullAccessStatuses = ['joined_with_pay_window', 'pending_pay_confirmation_from_driver', 'confirmed', 'completed', 'no_show'];

        // Determine grace period access for cancelled paid bookings
        let cancelledPaidWithinGrace = false;
        if (hasBooking && row.user_booking_status === 'cancelled' && row.trip_end_event_at) {
            const isPaid = row.user_paid;
            const isWithinGracePeriod = row.trip_end_event_at > new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
            cancelledPaidWithinGrace = isPaid && isWithinGracePeriod;
        }

        if (isDriver) {
            finalAccess = true;
        } else if (hasBooking && fullAccessStatuses.includes(row.user_booking_status)) {
            finalAccess = true;
        } else if (cancelledPaidWithinGrace) {
            finalAccess = true;
        } else {
            finalAccess = false;
        }

        const displayName = finalAccess ? row.driver_name : (row.driver_name ? (row.driver_name.substring(0, 3) + '***') : 'Anon');
        const driverPhone = finalAccess ? row.driver_phone : null;
        const paymentHandle = finalAccess ? row.snapshot_payment_handle : null;

        // reduce stalking risk
        const vehiclePlate = finalAccess && ['departed', 'done', 'aborted'].includes(row.status)
            ? row.car_plate
            : null;

        const ride = {
            id: row.id,
            isDriver, // Flag for frontend
            status: row.status,
            created_at: row.created_at,
            modified_at: row.modified_at,
            sensitive_info_access: finalAccess,
            cancelled_paid_booking_within_sensitive_info_grace_period: cancelledPaidWithinGrace,

            // Trip Details
            from_text: row.from_text,
            to_text: row.to_text,
            departure_time: row.departure_time,
            price: row.price,
            seats: {
                total: row.total_seats,
                taken: row.seats_taken
            },
            notes: row.notes,

            // Car Details
            car: row.car_id ? {
                id: row.car_id,
                make: row.car_make,
                model: row.car_model,
                color: row.car_color,
                year: row.car_year,
                plate: vehiclePlate
            } : null,

            // Driver Details (Public/Redacted)
            driver: {
                id: row.driver_id,
                name: displayName,
                verified: row.driver_verified,
                photo_url: row.driver_photo_url,
                member_since: row.driver_since,
                rating: row.driver_rating ?? null,
                completed_trips: row.driver_completed_trips ?? 0,
                phone: driverPhone,
                payment_handle: paymentHandle
            },

            // Rules
            rules: {
                luggage: {
                    big: row.big_luggage_lim,
                    small: row.small_luggage_lim
                },
                pickup: {
                    rules: row.pickup_rules,
                    radius: row.pickup_radius_meters,
                    dropoff_radius: row.drop_off_radius_meters
                },
                flexibility: row.departure_time_flexibility,
                payment: {
                    methods: row.payment_methods,
                    handle: paymentHandle
                },
                auto_accept: row.auto_accept,
                cancellation_policy: row.cancellation_policy,
                cutoff_time: row.cutoff_time,
                pay_window: row.pay_window,
                start_check_in_hrs: row.start_check_in_hrs_before_departure
            },
            start_check_in: row.start_check_in,
            user_booking: row.user_booking_status ? {
                id: row.user_booking_id,
                status: row.user_booking_status,
                seats_booked: row.user_seats_booked,
                big_luggage: row.user_big_luggage,
                small_luggage: row.user_small_luggage,
                paid: row.user_paid,
                ready: row.user_ready,
                ready_at: row.user_ready_at,
                preferred_pickup_time: row.user_preferred_pickup_time,
                created_at: row.user_booking_created_at,
                removed_at: row.user_removed_at,
                picked_up_at: row.user_picked_up_at,
                intended_payment_method: row.user_intended_payment_method
            } : null,
            user_booking_status: row.user_booking_status || null,
            snapshot_rules: {
                luggage: {
                    big: row.snapshot_big_luggage_lim,
                    small: row.snapshot_small_luggage_lim
                },
                pickup: {
                    rules: row.snapshot_pickup_rules,
                    radius: row.snapshot_pickup_radius_meters,
                    dropoff_radius: row.snapshot_drop_off_radius_meters
                },
                flexibility: row.snapshot_departure_time_flexibility,
                payment: {
                    methods: row.snapshot_payment_methods,
                    handle: paymentHandle
                },
                auto_accept: row.snapshot_auto_accept,
                cancellation_policy: row.snapshot_cancellation_policy,
                cutoff_time: row.snapshot_cutoff_time,
                pay_window: row.snapshot_pay_window,
                start_check_in_hrs: row.snapshot_start_check_in_hrs_before_departure
            }
        };

        return NextResponse.json(ride);

    } catch (error: any) {
        console.error('Error fetching ride details:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    } finally {
        client.release();
    }
}

// Helper to fetch Place Details from Google (New API)
async function fetchPlaceDetails(placeId: string, sessionToken: string) {
    const apiKey = process.env.SERVER_PLACES_KEY; // Server-side key
    if (!apiKey) throw new Error("SERVER_PLACES_KEY not configured");

    // Fields: location (lat/lng), formattedAddress
    const fields = 'location,formattedAddress';

    // Using the NEW Places API (v1)
    const url = `https://places.googleapis.com/v1/places/${placeId}?fields=${fields}&sessionToken=${sessionToken}&key=${apiKey}`;

    const res = await fetch(url);
    if (!res.ok) {
        const txt = await res.text();
        console.error(`Google Places Details Error (${placeId}):`, txt);
        throw new Error(`Failed to fetch place details for ${placeId}`);
    }

    const data = await res.json();
    return data;
}

export async function PATCH(
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

        // Transaction
        await client.query('BEGIN');

        // Lazy Check-in Start
        await checkAndProcessCheckInStart(client, rideId);

        // Lazy Trip Cutoff Check
        await checkAndProcessTripCutoff(client, rideId);

        // Lazy Cleanup of Timed Out Bookings
        const timeouts = await client.query(
            "SELECT id FROM bookings WHERE trip = $1 AND status = 'joined_with_pay_window'",
            [rideId]
        );
        for (const row of timeouts.rows) {
            await checkAndProcessPayWindowTimeout(client, row.id);
        }

        // Check ownership and current status
        const tripCheck = await client.query('SELECT driver, status FROM trips WHERE id = $1 FOR UPDATE', [rideId]);
        if (tripCheck.rowCount === 0) {
            await client.query('ROLLBACK');
            return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
        }
        if (tripCheck.rows[0].driver !== user.uid) {
            await client.query('ROLLBACK');
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const currentTripStatus = tripCheck.rows[0].status;
        const readOnlyTripStatuses = ['done', 'cancelled', 'aborted'];
        if (readOnlyTripStatuses.includes(currentTripStatus)) {
            await client.query('ROLLBACK');
            return NextResponse.json({ error: `Trip is ${currentTripStatus} and cannot be modified.` }, { status: 403 });
        }

        // --- FETCH OLD STATE FOR LOGGING ---
        const oldTripRes = await client.query(`
            SELECT t.*, tr.* 
            FROM trips t
            LEFT JOIN trip_rules tr ON t.id = tr.id
            WHERE t.id = $1
        `, [rideId]);
        const oldTripState = oldTripRes.rows[0];


        // Update TRIPS table
        // Fields: price, seats (total_seats), notes, car, departure_time, from_text, to_text, origin_geog, destination_geog

        // --- Auto-Status Update Logic (Seats Capacity) ---
        // If driver changes total_seats, we might need to toggle between 'bookable' and 'full'.
        if (body.total_seats !== undefined) {
            const seatsTaken = oldTripState.seats_taken;
            const newTotalSeats = body.total_seats;
            const currentStatus = oldTripState.status;
            // Use provided status or fallback to current
            let nextStatus = body.status !== undefined ? body.status : currentStatus;

            // Only relevant if we are currently bookable or full, or transitioning to one of them
            if (['bookable', 'full'].includes(nextStatus)) {
                if (nextStatus === 'bookable' && seatsTaken >= newTotalSeats) {
                    // Capacity reached/exceeded -> Full
                    body.status = 'full';
                } else if (nextStatus === 'full' && seatsTaken < newTotalSeats) {
                    // Capacity available -> Bookable
                    // We optimistically set it to bookable here.
                    // If it is past the cutoff time, the checkAndProcessTripCutoff() call 
                    // at the end of this transaction will immediately flip it to 'locked'.
                    body.status = 'bookable';
                }
            }

        }

        let newFromText: string | undefined;
        let newToText: string | undefined;

        if (body.price !== undefined || body.total_seats !== undefined || body.notes !== undefined ||
            body.car !== undefined || body.departure_time !== undefined ||
            body.from_text !== undefined || body.to_text !== undefined ||
            body.from_place_id !== undefined || body.to_place_id !== undefined || body.start_check_in !== undefined ||
            body.status !== undefined) {

            const updates = [];
            const values = [];
            let idx = 1;

            if (body.price !== undefined) {
                updates.push(`price = $${idx++}`);
                values.push(body.price);
            }
            if (body.total_seats !== undefined) {
                updates.push(`total_seats = $${idx++}`);
                values.push(body.total_seats);
            }
            if (body.notes !== undefined) {
                updates.push(`notes = $${idx++}`);
                values.push(body.notes);
            }
            if (body.car !== undefined) {
                // Verify car belongs to user
                // Check if car exists and belongs to user
                const carCheck = await client.query('SELECT id FROM cars WHERE id = $1 AND owner = $2', [body.car, user.uid]);
                if (carCheck.rowCount === 0) {
                    await client.query('ROLLBACK');
                    return NextResponse.json({ error: 'Car not found or unauthorized' }, { status: 400 });
                }

                updates.push(`car = $${idx++}`);
                values.push(body.car);
            }
            if (body.departure_time !== undefined) {
                updates.push(`departure_time = $${idx++}`);
                values.push(body.departure_time);
            }
            if (body.start_check_in !== undefined) {
                updates.push(`start_check_in = $${idx++}`);
                values.push(body.start_check_in);
            }
            if (body.status !== undefined) {
                const allowedStatuses = ['bookable', 'full', 'departed', 'done', 'cancelled', 'aborted', 'locked'];
                if (!allowedStatuses.includes(body.status)) {
                    await client.query('ROLLBACK');
                    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
                }

                if (body.status === 'locked') {
                    // Check if current status allows locking
                    const currentStatusRes = await client.query('SELECT status FROM trips WHERE id = $1', [rideId]);
                    const currentStatus = currentStatusRes.rows[0].status;
                    if (currentStatus !== 'bookable' && currentStatus !== 'full') {
                        await client.query('ROLLBACK');
                        return NextResponse.json({ error: 'Trip can only be locked if it is bookable or full' }, { status: 400 });
                    }
                }

                if (body.status === 'done') {
                    // Check if current status allows completion
                    const currentStatusRes = await client.query('SELECT status FROM trips WHERE id = $1', [rideId]);
                    const currentStatus = currentStatusRes.rows[0].status;
                    if (currentStatus !== 'departed' || readOnlyTripStatuses.includes(currentStatus)) {
                        await client.query('ROLLBACK');
                        return NextResponse.json({ error: 'Trip can only be marked as completed if it is currently departed or in a read-only state' }, { status: 400 });
                    }
                }

                if (body.status === 'cancelled') {
                    if (currentTripStatus === 'departed' || readOnlyTripStatuses.includes(currentTripStatus)) {
                        await client.query('ROLLBACK');
                        return NextResponse.json({ error: 'Cannot cancel a trip that has already departed or is in a read-only state' }, { status: 400 });
                    }
                }

                if (body.status === 'aborted') {
                    if (currentTripStatus !== 'departed' && !readOnlyTripStatuses.includes(currentTripStatus)) {
                        await client.query('ROLLBACK');
                        return NextResponse.json({ error: 'Cannot abort a trip that has not departed or is in a read-only state' }, { status: 400 });
                    }
                }

                if (body.status === 'bookable') {
                    // Unlock logic
                    const cutoffCheck = await client.query(`
                        SELECT 
                            t.status, 
                            tr.cutoff_time,
                            t.seats_taken,
                            t.total_seats,
                            CASE 
                                WHEN tr.cutoff_time IS NOT NULL THEN (NOW() >= (t.departure_time + COALESCE(tr.departure_time_flexibility, '0 seconds'::interval) - tr.cutoff_time))
                                ELSE false 
                            END as is_past_cutoff
                        FROM trips t
                        LEFT JOIN trip_rules tr ON t.id = tr.id
                        WHERE t.id = $1
                    `, [rideId]);

                    if (cutoffCheck.rows.length === 0) {
                        await client.query('ROLLBACK');
                        return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
                    }

                    const { is_past_cutoff, seats_taken, total_seats } = cutoffCheck.rows[0];

                    if (is_past_cutoff) {
                        await client.query('ROLLBACK');
                        return NextResponse.json({ error: 'Cannot unlock trip: booking cutoff time has passed' }, { status: 400 });
                    }

                    // Check seats - if full, set to 'full' instead of 'bookable'
                    if (seats_taken >= total_seats) {
                        body.status = 'full';
                    }
                }

                updates.push(`status = $${idx++}`);
                values.push(body.status);
            }

            // Handle Start Location (Place ID -> Geog AND Text)
            if (body.from_place_id) {
                const details = await fetchPlaceDetails(body.from_place_id, body.from_session_token || '');
                const lat = details.location.latitude;
                const lng = details.location.longitude;
                const text = details.formattedAddress || body.from_text;

                newFromText = text;

                updates.push(`from_text = $${idx++}`);
                values.push(text);
                updates.push(`origin_geog = ST_SetSRID(ST_MakePoint($${idx++}, $${idx++}), 4326)`);
                values.push(lng);
                values.push(lat);
            } else if (body.from_text !== undefined) {
                if (body.from_text.trim() === '') {
                    await client.query('ROLLBACK');
                    return NextResponse.json({ error: 'Start location text cannot be empty' }, { status: 400 });
                }
                newFromText = body.from_text;
                updates.push(`from_text = $${idx++}`);
                values.push(body.from_text);
            }

            // Handle End Location (Place ID -> Geog AND Text)
            if (body.to_place_id) {
                const details = await fetchPlaceDetails(body.to_place_id, body.to_session_token || '');
                const lat = details.location.latitude;
                const lng = details.location.longitude;
                const text = details.formattedAddress || body.to_text;

                newToText = text;

                updates.push(`to_text = $${idx++}`);
                values.push(text);
                updates.push(`destination_geog = ST_SetSRID(ST_MakePoint($${idx++}, $${idx++}), 4326)`);
                values.push(lng);
                values.push(lat);
            } else if (body.to_text !== undefined) {
                if (body.to_text.trim() === '') {
                    await client.query('ROLLBACK');
                    return NextResponse.json({ error: 'Destination text cannot be empty' }, { status: 400 });
                }
                newToText = body.to_text;
                updates.push(`to_text = $${idx++}`);
                values.push(body.to_text);
            }


            if (updates.length > 0) {
                // Ensure modified_at is updated
                updates.push(`modified_at = NOW()`);

                values.push(rideId);
                await client.query(`UPDATE trips SET ${updates.join(', ')} WHERE id = $${idx}`, values);
            }
        }

        // Update RULES table
        const rulesUpdates = [];
        const rulesValues = [];

        const mapping: Record<string, string> = {
            bigLuggage: 'big_luggage_lim',
            smallLuggage: 'small_luggage_lim',
            pickupRules: 'pickup_rules',
            pickupRadius: 'pickup_radius_meters',
            dropoffRadius: 'drop_off_radius_meters',
            flexibility: 'departure_time_flexibility',
            paymentMethods: 'payment_methods',
            cancellationPolicy: 'cancellation_policy',
            autoAccept: 'auto_accept',
            cutoffTime: 'cutoff_time',
            payWindow: 'pay_window',
            paymentHandle: 'payment_handle',
            startCheckInHrs: 'start_check_in_hrs_before_departure'
        };

        let rIdx = 1;
        for (const [key, col] of Object.entries(mapping)) {
            let val = body[key];
            if (val !== undefined) {
                // Enforce defaults for required fields
                if (col === 'pay_window' && (val === null || val === '')) val = '60 minutes';
                if (col === 'cutoff_time' && (val === null || val === '')) val = '3 hours';
                if (col === 'departure_time_flexibility' && (val === null || val === '')) val = '15 minutes';

                rulesUpdates.push(`${col} = $${rIdx++}`);
                rulesValues.push(val);
            }
        }

        if (rulesUpdates.length > 0) {
            rulesValues.push(rideId);
            await client.query(`UPDATE trip_rules SET ${rulesUpdates.join(', ')} WHERE id = $${rIdx}`, rulesValues);
        }

        // --- CAR SNAPSHOT ON DEPARTURE ---
        if (body.status === 'departed' && oldTripState.status !== 'departed') {
            // Validate Driver Requirements
            const { checkDriverRequirementsForDeparture } = await import('@/app/api/lib/tripValidation');
            try {
                await checkDriverRequirementsForDeparture(client, user.uid, rideId);
            } catch (validationError: any) {
                await client.query('ROLLBACK');
                return NextResponse.json({ error: validationError.message }, { status: 400 });
            }

            // Logic: Copy from cars table to car_snapshots
            // The car to copy is the one currently assigned.
            // If body.car was updated in this same request, it's already in the DB (trips table updated above), 
            // but we can trust `body.car` ?? `oldTripState.car`.

            const carIdToSnapshot = body.car ?? oldTripState.car;

            if (carIdToSnapshot) {
                await client.query(`
                    INSERT INTO car_snapshots (
                        id, 
                        original_car_id, 
                        make, 
                        model, 
                        seats, 
                        big_luggage, 
                        small_luggage, 
                        plate, 
                        color, 
                        year
                    )
                    SELECT 
                        $1, 
                        id, 
                        make, 
                        model, 
                        seats, 
                        big_luggage, 
                        small_luggage, 
                        plate,
                        color,
                        year
                    FROM cars 
                    WHERE id = $2
                 `, [rideId, carIdToSnapshot]);
            }
        }

        // --- LOG TRIP EVENTS ---
        const { logTripEvent } = await import('@/app/api/lib/tripEvents');
        const changes: Record<string, any> = {};

        // Check for Status Changes (Primary Events)
        if (body.status && body.status !== oldTripState.status) {
            const newStatus = body.status;
            let eventType: 'trip_cancelled' | 'trip_departed' | 'trip_completed' | 'trip_updated' | 'trip_aborted' = 'trip_updated';

            if (newStatus === 'cancelled') eventType = 'trip_cancelled';
            else if (newStatus === 'departed') eventType = 'trip_departed';
            else if (newStatus === 'done') eventType = 'trip_completed';
            else if (newStatus === 'aborted') eventType = 'trip_aborted';

            const eventId = await logTripEvent({
                client,
                tripId: rideId,
                actorId: user.uid,
                eventType,
                affectedEntities: ['trips'],
                changes: { trip: { status: { old: oldTripState.status, new: newStatus } } }
            });

            // Cascade Cancellation to Bookings
            if (newStatus === 'cancelled') {
                const bookingsToCancelRes = await client.query(`
                    SELECT id, status, rider 
                    FROM bookings 
                    WHERE trip = $1 
                      AND status IN ('confirmed', 'waiting_approval', 'joined_with_pay_window', 'pending_pay_confirmation_from_driver')
                 `, [rideId]);

                const bookingsToCancel = bookingsToCancelRes.rows;
                const bookingIds = bookingsToCancel.map(r => r.id);

                if (bookingIds.length > 0) {
                    // Bulk update bookings to 'cancelled'
                    await client.query(`
                        UPDATE bookings 
                        SET status = 'cancelled' 
                        WHERE id = ANY($1)
                    `, [bookingIds]);

                    // Insert into booking_status_history
                    for (const booking of bookingsToCancel) {
                        await client.query(`
                            INSERT INTO booking_status_history (booking_id, actor_id, old_status, new_status, trigger_event_id)
                            VALUES ($1, $2, $3, 'cancelled', $4)
                        `, [booking.id, user.uid, booking.status, eventId]);
                    }
                }
            } else if (newStatus === 'done') {
                // Cascade Done to Bookings
                const bookingsToProcessRes = await client.query(`
                    SELECT id, status, picked_up 
                    FROM bookings 
                    WHERE trip = $1 
                      AND status NOT IN ('pay_timeout', 'removed', 'left_paid', 'left_unpaid', 'cancelled', 'completed', 'no_show')
                `, [rideId]);

                const bookingsToProcess = bookingsToProcessRes.rows;

                for (const booking of bookingsToProcess) {
                    let newBookingStatus = '';
                    if (booking.picked_up) {
                        newBookingStatus = 'completed';
                    } else {
                        newBookingStatus = 'no_show';
                    }

                    if (newBookingStatus && newBookingStatus !== booking.status) {
                        await client.query('UPDATE bookings SET status = $1 WHERE id = $2', [newBookingStatus, booking.id]);
                        await client.query(`
                            INSERT INTO booking_status_history (booking_id, actor_id, old_status, new_status, trigger_event_id)
                            VALUES ($1, $2, $3, $4, $5)
                        `, [booking.id, user.uid, booking.status, newBookingStatus, eventId]);
                    }
                }
            } else if (newStatus === 'aborted') {
                // Cascade Aborted to Bookings
                const bookingsToProcessRes = await client.query(`
                    SELECT id, status, picked_up 
                    FROM bookings 
                    WHERE trip = $1 
                      AND status NOT IN ('pay_timeout', 'removed', 'left_paid', 'left_unpaid', 'cancelled', 'completed', 'no_show')
                `, [rideId]);

                const bookingsToProcess = bookingsToProcessRes.rows;

                for (const booking of bookingsToProcess) {
                    let newBookingStatus = '';
                    if (booking.picked_up) {
                        newBookingStatus = 'completed';
                    } else {
                        newBookingStatus = 'cancelled';
                    }

                    if (newBookingStatus && newBookingStatus !== booking.status) {
                        await client.query('UPDATE bookings SET status = $1 WHERE id = $2', [newBookingStatus, booking.id]);
                        await client.query(`
                            INSERT INTO booking_status_history (booking_id, actor_id, old_status, new_status, trigger_event_id)
                            VALUES ($1, $2, $3, $4, $5)
                        `, [booking.id, user.uid, booking.status, newBookingStatus, eventId]);
                    }
                }
            }
        }

        // Check for Content Updates (trip_updated)
        // Helper to check equality loosely
        const isDiff = (a: any, b: any) => {
            if (a instanceof Date && b instanceof Date) return a.getTime() !== b.getTime();
            if (a instanceof Date && typeof b === 'string') return a.getTime() !== new Date(b).getTime();
            if (Array.isArray(a) && Array.isArray(b)) return JSON.stringify(a.sort()) !== JSON.stringify(b.sort());
            if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) return JSON.stringify(a) !== JSON.stringify(b); // basic strict equality for objects
            if (a == b) return false; // fast path for primitives
            return true;
        };

        const tripChanges: Record<string, any> = {};
        let hasContentUpdates = false;

        const tripFieldsToCheck = {
            price: 'price',
            total_seats: 'total_seats',
            notes: 'notes',
            departure_time: 'departure_time',
            car: 'car',
            start_check_in: 'start_check_in'
        };

        for (const [bodyKey, dbCol] of Object.entries(tripFieldsToCheck)) {
            // @ts-ignore - dynamic access
            if (body[bodyKey] !== undefined && isDiff(oldTripState[dbCol], body[bodyKey])) {
                // @ts-ignore
                tripChanges[dbCol] = { old: oldTripState[dbCol], new: body[bodyKey] };
                hasContentUpdates = true;
            }
        }

        // Locations (Special Handling)
        if (newFromText && isDiff(oldTripState.from_text, newFromText)) {
            tripChanges.from_location = { old: oldTripState.from_text, new: newFromText }; hasContentUpdates = true;
        }
        if (newToText && isDiff(oldTripState.to_text, newToText)) {
            tripChanges.to_location = { old: oldTripState.to_text, new: newToText }; hasContentUpdates = true;
        }

        // Rules Fields
        const { areIntervalsEqual } = await import('@/app/api/lib/intervalUtils');
        const ruleChanges: Record<string, any> = {};
        const ruleFieldsMap = {
            bigLuggage: 'big_luggage_lim',
            smallLuggage: 'small_luggage_lim',
            pickupRules: 'pickup_rules',
            pickupRadius: 'pickup_radius_meters',
            dropoffRadius: 'drop_off_radius_meters',
            flexibility: 'departure_time_flexibility',
            paymentMethods: 'payment_methods',
            cancellationPolicy: 'cancellation_policy',
            autoAccept: 'auto_accept',
            cutoffTime: 'cutoff_time',
            payWindow: 'pay_window',
            paymentHandle: 'payment_handle',
            startCheckInHrs: 'start_check_in_hrs_before_departure'
        };

        const intervalFields = ['departure_time_flexibility', 'cutoff_time', 'pay_window', 'start_check_in_hrs_before_departure'];

        for (const [bodyKey, dbCol] of Object.entries(ruleFieldsMap)) {
            // @ts-ignore
            if (body[bodyKey] !== undefined) {
                // @ts-ignore
                const oldValue = oldTripState[dbCol];
                // @ts-ignore
                const newValue = body[bodyKey];

                let changed = false;
                if (intervalFields.includes(dbCol)) {
                    if (!areIntervalsEqual(oldValue, newValue)) {
                        changed = true;
                    }
                } else {
                    if (isDiff(oldValue, newValue)) {
                        changed = true;
                    }
                }

                if (changed) {
                    ruleChanges[dbCol] = { old: oldValue, new: newValue };
                    hasContentUpdates = true;
                }
            }
        }

        if (hasContentUpdates) {
            const affected = [];
            const changesPayload: any = {};

            if (Object.keys(tripChanges).length > 0) {
                affected.push('trips');
                changesPayload.trip = tripChanges;
            }
            if (Object.keys(ruleChanges).length > 0) {
                affected.push('trip_rules');
                changesPayload.rules = ruleChanges;
            }

            if (affected.length > 0) {
                await logTripEvent({
                    client,
                    tripId: rideId,
                    actorId: user.uid,
                    eventType: 'trip_updated',
                    affectedEntities: affected,
                    changes: changesPayload
                });
            }
        }


        // Check if the trip should be locked due to cutoff
        // This handles the case where we auto-updated to 'bookable' but it's actually too late.
        await checkAndProcessTripCutoff(client, rideId);

        await client.query('COMMIT');
        return NextResponse.json({ success: true });

    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error("Update Trip Error:", error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    } finally {
        client.release();
    }
}
