import { NextResponse } from 'next/server';
import { pool } from '@/app/api/lib/db';
import dayjs, { CHICAGO_TZ } from '@/utils/dateUtils';
import { verifyUserFromRequest } from '@/app/api/lib/verifyUser';
import { checkAndProcessPayWindowTimeout } from '@/app/api/lib/payWindow';
import { checkAndProcessCheckInStart } from '@/app/api/lib/checkIn';
import { checkAndProcessTripCutoff } from '@/app/api/lib/tripCutoff';
import { createNotification } from '@/app/api/lib/createNotification';
import { getTranslationForUser, getTranslation } from '@/app/api/lib/i18n';
import { extractPublicArea } from '@/app/api/lib/extractPublicArea';
import { createObfuscatedBounds } from '@/app/api/lib/geoUtils';
import { parsePostgresIntervalToMs } from '@/app/api/lib/intervalUtils';
import { markTripAsDone } from '@/app/api/lib/tripActions';
import { areIntervalsEqual } from '@/app/api/lib/intervalUtils';
import { checkDriverRequirementsForDeparture } from '@/app/api/lib/tripValidation';
import { logTripEvent } from '@/app/api/lib/tripEvents';
import { redactName } from '@/app/api/lib/redactName';
import { processPaymentQRCode } from '@/app/api/lib/processQRCode';

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

        const t = await getTranslationForUser(userId, client);

        // Lazy Cleanup/Processes
        const timeouts = await client.query(
            "SELECT id FROM bookings WHERE trip = $1 AND status = 'joined_with_pay_window'",
            [rideId]
        );
        for (const row of timeouts.rows) {
            await checkAndProcessPayWindowTimeout(client, row.id);
        }
        await checkAndProcessCheckInStart(client, rideId);
        await checkAndProcessTripCutoff(client, rideId);

        const query = `
      SELECT 
        -- Trip Info
        t.id, t.price, t.notes, t.from_text, t.to_text, t.departure_time,
        t.total_seats, t.seats_taken, t.status, t.start_check_in,
        t.created_at, t.modified_at, t.from_input_text, t.to_input_text,
        ST_X(t.origin_geog::geometry) as origin_lng, ST_Y(t.origin_geog::geometry) as origin_lat,
        ST_X(ST_SnapToGrid(t.origin_geog::geometry, 0.002)) as fuzzy_lng, ST_Y(ST_SnapToGrid(t.origin_geog::geometry, 0.002)) as fuzzy_lat,
        ST_X(t.destination_geog::geometry) as dest_lng, ST_Y(t.destination_geog::geometry) as dest_lat,
        
        -- Event Info (End Time)
        tc.created_at as trip_end_event_at,
        
        -- Rule Info
        tr.big_luggage_lim, tr.small_luggage_lim, tr.pickup_rules,
        tr.pickup_radius_meters, tr.drop_off_radius_meters,
        tr.departure_time_flexibility, tr.payment_methods,
        tr.cancellation_policy, tr.payment_handle, tr.auto_accept,
        tr.cutoff_time, tr.pay_window, tr.start_check_in_hrs_before_departure,
        tr.payment_qr_codes,
        
        -- Car Info
        CASE WHEN (t.status in ('departed', 'done', 'aborted')) THEN cs.original_car_id ELSE c.id END as car_id,
        CASE WHEN (t.status in ('departed', 'done', 'aborted')) THEN cs.make ELSE c.make END as car_make,
        CASE WHEN (t.status in ('departed', 'done', 'aborted')) THEN cs.model ELSE c.model END as car_model,
        CASE WHEN (t.status in ('departed', 'done', 'aborted')) THEN cs.color ELSE c.color END as car_color,
        CASE WHEN (t.status in ('departed', 'done', 'aborted')) THEN cs.year ELSE c.year END as car_year,
        CASE WHEN (t.status in ('departed', 'done', 'aborted')) THEN cs.plate ELSE c.plate END as car_plate,
        CASE WHEN (t.status in ('departed', 'done', 'aborted')) THEN cs.seats ELSE c.seats END as car_seats,
        CASE WHEN (t.status in ('departed', 'done', 'aborted')) THEN cs.big_luggage ELSE c.big_luggage END as car_big_luggage,
        CASE WHEN (t.status in ('departed', 'done', 'aborted')) THEN cs.small_luggage ELSE c.small_luggage END as car_small_luggage,
        
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
        ub.pickup_location_text as user_pickup_location_text,
        ub.rider_note as user_rider_note,

        -- Snapshot Rules
        brs.payment_handle as snapshot_payment_handle,
        brs.payment_methods as snapshot_payment_methods,
        brs.payment_qr_codes as snapshot_payment_qr_codes

      FROM trips t
      LEFT JOIN trip_rules tr ON t.id = tr.id
      LEFT JOIN cars c ON t.car = c.id
      LEFT JOIN car_snapshots cs ON t.id = cs.id
      LEFT JOIN profile_global pg ON t.driver = pg.id
      LEFT JOIN profile_driver pd ON t.driver = pd.id
      LEFT JOIN LATERAL (
        SELECT id, status, seats_booked, big_luggage, small_luggage, paid, ready, ready_at, preferred_pickup_time, created_at, picked_up_at, intended_payment_method, pickup_location_text, rider_note
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
        WHERE trip = t.id 
        AND event_type in ('trip_cancelled', 'trip_aborted', 'trip_completed') 
        ORDER BY created_at DESC
        LIMIT 1
      ) tc ON true
      WHERE t.id = $1
    `;

        const result = await client.query(query, [rideId, userId]);

        if (result.rowCount === 0) {
            return NextResponse.json({ error: t('api.errors.rideNotFound') }, { status: 404 });
        }

        const row = result.rows[0];
        const isDriver = user && user.uid === row.driver_id;
        const hasBooking = !!row.user_booking_id;

        // --- 1. Define Permissions ---

        // A. Receipt Access (Permanent Identity)
        const canViewReceipt = isDriver || hasBooking;

        // B. Define States
        const isRemoved = row.user_booking_status === 'removed';

        const activeBookingStatuses = [
            'joined_with_pay_window',
            'pending_pay_confirmation_from_driver',
            'confirmed',
        ];
        const isInteractionActive = activeBookingStatuses.includes(row.user_booking_status);

        // Grace Period: 24 Hours
        let isRecent = false;
        if (row.trip_end_event_at) {
            isRecent = row.trip_end_event_at > new Date(Date.now() - 24 * 60 * 60 * 1000);
        } else {
            isRecent = true; // trip end event is null, means trip is still ongoing
        }

        // C. Phone Permissions (Strict Safety)
        // Rule: HIDE if Removed, even if Paid.
        // Visible only if active coordination is needed OR recent successful drop-off.
        let canViewPhone = false;

        if (isDriver) {
            canViewPhone = true;
        } else if (hasBooking && !isRemoved) { // Explicitly BLOCK removed riders
            if (isInteractionActive || isRecent) {
                canViewPhone = true;
            }
        }

        // D. Financial Permissions (Transparency)
        // Rule: SHOW if Active OR (Paid AND Recent).
        // Allows removed riders to verify the Venmo/CashApp handle for fraud reporting.
        let canViewPaymentHandle = false;

        if (isDriver) {
            canViewPaymentHandle = true;
        } else if (hasBooking) {
            // If they are active, they need to pay.
            // If they PAID, they need to see where the money went (even if removed).
            if (isInteractionActive || (row.user_paid && isRecent)) {
                canViewPaymentHandle = true;
            }
        }

        // --- 2. Apply Redaction ---

        // Geo Privacy for Requests
        let obfuscatedBounds = null;
        if (!isDriver && row.origin_lat && row.origin_lng) {
            obfuscatedBounds = createObfuscatedBounds(row.origin_lat, row.origin_lng, row.pickup_radius_meters || 5000, rideId);
        }

        // Identity
        const displayName = canViewReceipt ? row.driver_name : redactName(row.driver_name);
        const photoUrl = canViewReceipt ? row.driver_photo_url : null;

        // Contact Fields
        const driverPhone = canViewPhone ? row.driver_phone : null;

        // Use snapshot handle for stability, fallback to current rule if needed (though query prioritizes snapshot)
        const paymentHandle = canViewPaymentHandle ? row.payment_handle : null;

        // Plate: strictly operational
        const vehiclePlate = (canViewReceipt && row.status === "departed") ? row.car_plate : null;

        const ride = {
            id: row.id,
            isDriver,
            status: row.status,
            created_at: row.created_at,
            modified_at: row.modified_at,

            // Flags for frontend UI logic
            access: {
                receipt: canViewReceipt,
                contact: canViewPhone, // "Contact" usually implies phone/messaging
                financial: canViewPaymentHandle // New flag for UI
            },

            from_input_text: isDriver ? row.from_input_text : null,
            from_text: row.from_text,
            to_input_text: isDriver ? row.to_input_text : null,
            to_text: row.to_text,
            departure_time: row.departure_time,
            price: row.price,
            seats: {
                total: row.total_seats,
                taken: row.seats_taken
            },
            notes: row.notes,

            origin: {
                lat: isDriver ? row.origin_lat : null,
                lng: isDriver ? row.origin_lng : null,
                // Fuzzy Data for Riders
                fuzzy_lat: !isDriver ? row.fuzzy_lat : null,
                fuzzy_lng: !isDriver ? row.fuzzy_lng : null,
                obfuscated_bounds: !isDriver ? obfuscatedBounds : null,
            },
            destination: {
                lat: isDriver ? row.dest_lat : null,
                lng: isDriver ? row.dest_lng : null
            },

            car: row.car_id ? {
                id: row.car_id,
                make: row.car_make,
                model: row.car_model,
                color: row.car_color,
                year: row.car_year,
                plate: vehiclePlate,
            } : null,

            driver: {
                id: row.driver_id,
                name: displayName,
                verified: row.driver_verified,
                photo_url: photoUrl,
                member_since: row.driver_since,
                rating: row.driver_rating ?? null,
                completed_trips: row.driver_completed_trips ?? 0,
                phone: driverPhone,
                payment_handle: paymentHandle
            },

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
                    handle: paymentHandle,
                    qr_codes: row.payment_qr_codes || {}
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
                intended_payment_method: row.user_intended_payment_method,
                pickup_location_text: row.user_pickup_location_text || null,
                rider_note: row.user_rider_note || null
            } : null,
            user_booking_status: row.user_booking_status || null,
            snapshot_rules: {
                payment: {
                    methods: row.snapshot_payment_methods,
                    handle: row.snapshot_payment_handle,
                    qr_codes: row.snapshot_payment_qr_codes || {}
                }
            }
        };

        return NextResponse.json(ride);

    } catch (error: any) {
        console.error('Error fetching ride details:', error);
        const t = await getTranslation('en'); // Default to English for generic errors
        return NextResponse.json({ error: t('api.errors.internalError') }, { status: 500 });
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

async function fetchGeocodeResult(lat: number, lng: number) {
    const apiKey = process.env.SERVER_PLACES_KEY; // Server-side key
    if (!apiKey) throw new Error("SERVER_PLACES_KEY not configured");

    // Fields: location (lat/lng), formattedAddress
    const fields = 'location,formattedAddress';

    // Using the NEW Places API (v1)
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`;

    const res = await fetch(url);
    if (!res.ok) {
        const txt = await res.text();
        console.error(`Google Geocode Error (${lat},${lng}):`, txt);
        throw new Error(`Failed to fetch geocode result for ${lat},${lng}`);
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
            const t = await getTranslation('en');
            return NextResponse.json({ error: t('api.errors.unauthorized') }, { status: 401 });
        }

        const t = await getTranslationForUser(user.uid, client);

        const body = await req.json();

        // Transaction
        await client.query('BEGIN');

        // Lazy Check-in Start
        // SKIP if we are about to depart (manual departure handles check-in start + logging)
        if (body.status !== 'departed') {
            await checkAndProcessCheckInStart(client, rideId);
        }

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
            return NextResponse.json({ error: t('api.errors.tripNotFound') }, { status: 404 });
        }
        if (tripCheck.rows[0].driver !== user.uid) {
            await client.query('ROLLBACK');
            return NextResponse.json({ error: t('api.errors.forbidden') }, { status: 403 });
        }

        const currentTripStatus = tripCheck.rows[0].status;
        const readOnlyTripStatuses = ['done', 'cancelled', 'aborted'];
        if (readOnlyTripStatuses.includes(currentTripStatus)) {
            await client.query('ROLLBACK');
            return NextResponse.json({ error: t('api.errors.tripReadOnly') }, { status: 403 });
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

        // If driver changes total_seats, we might need to toggle between 'bookable' and 'full'.
        if (body.total_seats !== undefined) {
            const seatsTaken = oldTripState.seats_taken;
            const newTotalSeats = body.total_seats;

            if (newTotalSeats < seatsTaken) {
                await client.query('ROLLBACK');
                return NextResponse.json({ error: t('api.errors.cannotReduceSeats', { seatsTaken }) }, { status: 400 });
            }

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
                    return NextResponse.json({ error: t('api.errors.carNotFound') }, { status: 400 });
                }

                updates.push(`car = $${idx++}`);
                values.push(body.car);
            }
            if (body.departure_time !== undefined) {
                const departureDate = dayjs.tz(body.departure_time, CHICAGO_TZ);
                const oldDepartureDate = dayjs.tz(oldTripState.departure_time, CHICAGO_TZ);
                const nowChicago = dayjs().tz(CHICAGO_TZ);

                if (departureDate.isBefore(nowChicago)) {
                    // Only error if the time is actually changing
                    if (!departureDate.isSame(oldDepartureDate)) {
                        await client.query('ROLLBACK');
                        return NextResponse.json({ error: t('api.errors.departureTimePast') }, { status: 400 });
                    }
                }
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
                    return NextResponse.json({ error: t('api.errors.invalidStatus') }, { status: 400 });
                }

                if (body.status === 'locked') {
                    // Check if current status allows locking
                    const currentStatusRes = await client.query('SELECT status FROM trips WHERE id = $1', [rideId]);
                    const currentStatus = currentStatusRes.rows[0].status;
                    if (currentStatus !== 'bookable' && currentStatus !== 'full') {
                        await client.query('ROLLBACK');
                        return NextResponse.json({ error: t('api.errors.tripLockedStatus') }, { status: 400 });
                    }
                }

                if (body.status === 'done') {
                    // Check if current status allows completion
                    const currentStatusRes = await client.query('SELECT status FROM trips WHERE id = $1', [rideId]);
                    const currentStatus = currentStatusRes.rows[0].status;
                    if (currentStatus !== 'departed' || readOnlyTripStatuses.includes(currentStatus)) {
                        await client.query('ROLLBACK');
                        return NextResponse.json({ error: t('api.errors.tripCompleteStatus') }, { status: 400 });
                    }
                }

                if (body.status === 'cancelled') {
                    if (currentTripStatus === 'departed' || readOnlyTripStatuses.includes(currentTripStatus)) {
                        await client.query('ROLLBACK');
                        return NextResponse.json({ error: t('api.errors.tripCancelStatus') }, { status: 400 });
                    }
                }

                if (body.status === 'aborted') {
                    if (currentTripStatus !== 'departed' && !readOnlyTripStatuses.includes(currentTripStatus)) {
                        await client.query('ROLLBACK');
                        return NextResponse.json({ error: t('api.errors.tripAbortStatus') }, { status: 400 });
                    }
                }

                if (body.status === 'departed') {
                    // Pre-Departure Check: Early Departure Validation
                    // If trying to depart BEFORE (Departure Time - Flexibility), require all active passengers to be checked in.

                    const now = new Date();
                    // Use new departure time if provided, else old
                    const departureTime = body.departure_time ? new Date(body.departure_time) : new Date(oldTripState.departure_time);

                    // Use new flexibility if provided (mapped from body.flexibility), else old
                    // note: body.flexibility maps to departure_time_flexibility in DB, see mapping below. But we access before mapping loop.
                    const flexibilityVal = body.flexibility !== undefined ? body.flexibility : oldTripState.departure_time_flexibility;
                    const flexMs = (flexibilityVal === null || flexibilityVal === undefined)
                        ? 15 * 60 * 1000
                        : parsePostgresIntervalToMs(flexibilityVal);

                    const earliestDeparture = new Date(departureTime.getTime() - flexMs);

                    if (now < earliestDeparture) {
                        // Check if all active riders are ready
                        // Excludes 'joined_with_pay_window' per user request, only confirmed/pending-pay need to be ready.
                        const notReadyRiders = await client.query(`
                            SELECT id FROM bookings 
                            WHERE trip = $1 
                            AND status IN ('pending_pay_confirmation_from_driver', 'confirmed')
                            AND ready = false
                        `, [rideId]);

                        if ((notReadyRiders.rowCount || 0) > 0) {
                            await client.query('ROLLBACK');
                            return NextResponse.json({
                                error: t('api.errors.departEarly')
                            }, { status: 400 });
                        }
                    }

                    updates.push(`actual_departure_time = $${idx++}`);
                    values.push("NOW()");

                    // Auto-start check-in
                    if (body.start_check_in === undefined) {
                        body.start_check_in = true;
                        updates.push(`start_check_in = $${idx++}`);
                        values.push(true);
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
                        return NextResponse.json({ error: t('api.errors.tripNotFound') }, { status: 404 });
                    }

                    const { is_past_cutoff, seats_taken, total_seats } = cutoffCheck.rows[0];

                    if (is_past_cutoff) {
                        await client.query('ROLLBACK');
                        return NextResponse.json({ error: t('api.errors.cannotUnlock') }, { status: 400 });
                    }

                    // Check seats - if full, set to 'full' instead of 'bookable'
                    if (seats_taken >= total_seats) {
                        body.status = 'full';
                    }
                }

                if (body.status !== 'done') {
                    updates.push(`status = $${idx++}`);
                    values.push(body.status);
                }
            }

            // Handle Start Location (Place ID -> Geog AND Text)
            if (body.from_place_id) {
                const details = await fetchPlaceDetails(body.from_place_id, body.from_session_token || '');
                const lat = details.location.latitude;
                const lng = details.location.longitude;
                const geocodeResult = await fetchGeocodeResult(lat, lng);
                const publicArea = extractPublicArea(geocodeResult);

                // store the approximate neighborhood to from_text
                // store exact address to from_input_text
                const text = publicArea;
                const inputText = body.from_input_text;

                newFromText = text;

                updates.push(`from_text = $${idx++}`);
                values.push(text);
                updates.push(`from_input_text = $${idx++}`);
                values.push(inputText);
                updates.push(`origin_geog = ST_SetSRID(ST_MakePoint($${idx++}, $${idx++}), 4326)`);
                values.push(lng);
                values.push(lat);
            } else if (body.from_text !== undefined) {
                if (body.from_text.trim() === '') {
                    await client.query('ROLLBACK');
                    return NextResponse.json({ error: t('api.errors.startLocationEmpty') }, { status: 400 });
                }
                newFromText = body.from_input_text;
                updates.push(`from_input_text = $${idx++}`);
                values.push(body.from_input_text);
            }

            // Handle End Location (Place ID -> Geog AND Text)
            if (body.to_place_id) {
                const details = await fetchPlaceDetails(body.to_place_id, body.to_session_token || '');
                const lat = details.location.latitude;
                const lng = details.location.longitude;
                // store the approximate neighborhood to to_text
                // store exact address to to_input_text
                const text = body.to_input_text;
                const geocodeResult = await fetchGeocodeResult(lat, lng);
                const publicArea = extractPublicArea(geocodeResult);

                newToText = publicArea;

                updates.push(`to_text = $${idx++}`);
                values.push(publicArea);
                updates.push(`to_input_text = $${idx++}`);
                values.push(text);
                updates.push(`destination_geog = ST_SetSRID(ST_MakePoint($${idx++}, $${idx++}), 4326)`);
                values.push(lng);
                values.push(lat);
            } else if (body.to_text !== undefined) {
                if (body.to_text.trim() === '') {
                    await client.query('ROLLBACK');
                    return NextResponse.json({ error: t('api.errors.destinationEmpty') }, { status: 400 });
                }
                newToText = body.to_input_text;
                updates.push(`to_input_text = $${idx++}`);
                values.push(body.to_input_text);
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

        // --- PROCESS PAYMENT QR CODES ---
        // paymentQRCodes can contain:
        // - base64 string: new upload, process and store
        // - URL string (https://): existing image, keep as-is
        // - null/undefined: remove this payment method's QR code
        if (body.paymentQRCodes !== undefined) {
            const existingQRCodes = oldTripState.payment_qr_codes || {};
            const newQRCodes: Record<string, string> = {};
            const paymentMethods = body.paymentMethods ?? oldTripState.payment_methods ?? [];

            for (const method of paymentMethods) {
                const qrData = body.paymentQRCodes[method];

                if (qrData && typeof qrData === 'string') {
                    if (qrData.startsWith('data:')) {
                        // New base64 upload - process it
                        const url = await processPaymentQRCode(qrData, user.uid, t);
                        newQRCodes[method] = url;
                    } else if (qrData.startsWith('https://')) {
                        // Existing URL - keep it
                        newQRCodes[method] = qrData;
                    }
                }
                // If qrData is null/undefined/empty, the method is removed from newQRCodes
            }

            // Update the payment_qr_codes column
            await client.query(
                `UPDATE trip_rules SET payment_qr_codes = $1 WHERE id = $2`,
                [newQRCodes, rideId]
            );
        }

        // --- CAR SNAPSHOT ON DEPARTURE ---
        if (body.status === 'departed' && oldTripState.status !== 'departed') {
            // Validate Driver Requirements
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
        const changes: Record<string, any> = {};

        // Check for Status Changes (Primary Events)
        if (body.status && body.status !== oldTripState.status) {
            const newStatus = body.status;
            let eventType: 'trip_cancelled' | 'trip_departed' | 'trip_completed' | 'trip_updated' | 'trip_aborted' = 'trip_updated';

            if (newStatus === 'cancelled') eventType = 'trip_cancelled';
            else if (newStatus === 'departed') eventType = 'trip_departed';
            else if (newStatus === 'done') eventType = 'trip_completed';
            else if (newStatus === 'aborted') eventType = 'trip_aborted';

            // Notify Rider: Trip Departed (active bookings only)
            if (newStatus === 'departed') {
                const activeRiders = await client.query(`
                    SELECT rider FROM bookings 
                    WHERE trip = $1 
                    AND status IN ('confirmed', 'joined_with_pay_window', 'pending_pay_confirmation_from_driver')
                 `, [rideId]);

                for (const r of activeRiders.rows) {
                    await createNotification({
                        client,
                        type: 'trip_departed',
                        titleKey: 'notifications.types.trip_departed.title',
                        messageKey: 'notifications.types.trip_departed.message',
                        userId: r.rider,
                        openLink: `/dashboard/${rideId}`,
                        entityType: 'trips',
                        entityId: rideId,
                        role: 'rider'
                    });
                }
            }

            let eventId: string | undefined;
            if (newStatus !== 'done') {
                const changesPayload: any = { trip: { status: { old: oldTripState.status, new: newStatus } } };

                if (newStatus === 'departed' && !oldTripState.start_check_in && body.start_check_in) {
                    changesPayload.trip.start_check_in = { old: false, new: true };
                }

                eventId = await logTripEvent({
                    client,
                    tripId: rideId,
                    actorId: user.uid,
                    eventType,
                    affectedEntities: ['trips'],
                    changes: changesPayload
                });
            }

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

                        // Notify Rider: Trip Cancelled
                        await createNotification({
                            client,
                            type: 'trip_cancelled',
                            titleKey: 'notifications.types.trip_cancelled.title',
                            messageKey: 'notifications.types.trip_cancelled.message',
                            userId: booking.rider,
                            openLink: `/dashboard/${rideId}`,
                            entityType: 'trips',
                            entityId: rideId,
                            role: 'rider'
                        });
                    }
                }
            } else if (newStatus === 'done') {
                await markTripAsDone(client, rideId, user.uid);
            } else if (newStatus === 'aborted') {
                // Cascade Aborted to Bookings
                const bookingsToProcessRes = await client.query(`
                    SELECT id, status, picked_up, rider 
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

                        // Notify Rider: Trip Aborted
                        await createNotification({
                            client,
                            type: 'trip_aborted',
                            titleKey: 'notifications.types.trip_aborted.title',
                            messageKey: 'notifications.types.trip_aborted.message',
                            userId: booking.rider,
                            openLink: `/dashboard/${rideId}`,
                            entityType: 'trips',
                            entityId: rideId,
                            role: 'rider'
                        });
                    }
                }
            }
        }

        // Notify Riders: Check-in Started (Manual)
        // Note: auto-start is handled in checkAndProcessCheckInStart, checking oldTripState avoids duplicate notifications.
        if (body.start_check_in === true && oldTripState.start_check_in === false) {
            const activeRiders = await client.query(`
                SELECT rider FROM bookings 
                WHERE trip = $1 
                AND status IN ('confirmed', 'joined_with_pay_window', 'pending_pay_confirmation_from_driver')
            `, [rideId]);

            for (const r of activeRiders.rows) {
                await createNotification({
                    client,
                    type: 'check_in_started',
                    titleKey: 'notifications.types.check_in_started.title',
                    messageKey: 'notifications.types.check_in_started.message',
                    userId: r.rider,
                    openLink: `/dashboard/${rideId}`,
                    entityType: 'trips',
                    entityId: rideId,
                    role: 'rider'
                });
            }
        }

        // Check for Content Updates (trip_updated)
        // Helper to check equality loosely
        const isDiff = (a: any, b: any, toleranceMs: number = 0) => {
            // Normalize strings/nulls/undefined to empty string for comparison
            const norm = (v: any) => (v === null || v === undefined) ? '' : (typeof v === 'string' ? v.trim() : v);
            const nA = norm(a);
            const nB = norm(b);

            if (nA === nB) return false;

            if (a instanceof Date && b instanceof Date) {
                return Math.abs(a.getTime() - b.getTime()) >= toleranceMs;
            }
            if (a instanceof Date && typeof b === 'string') {
                return Math.abs(a.getTime() - new Date(b).getTime()) >= toleranceMs;
            }
            if (Array.isArray(a) && Array.isArray(b)) return JSON.stringify(a.sort()) !== JSON.stringify(b.sort());
            if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) return JSON.stringify(a) !== JSON.stringify(b); // basic strict equality for objects

            return true;
        };

        const tripLogChanges: Record<string, any> = {};
        const tripNotificationChanges: Record<string, any> = {};

        const ruleLogChanges: Record<string, any> = {};
        const ruleNotificationChanges: Record<string, any> = {};

        const tripFieldsToCheck = {
            departure_time: 'departure_time',
            car: 'car',
            notes: 'notes',
        };

        const tripNotificationFields = Object.keys(tripFieldsToCheck);

        for (const [bodyKey, dbCol] of Object.entries(tripFieldsToCheck)) {
            // @ts-ignore - dynamic access
            const hasChanged = isDiff(oldTripState[dbCol], body[bodyKey]);
            if (body[bodyKey] !== undefined && hasChanged) {
                // @ts-ignore
                const change = { old: oldTripState[dbCol], new: body[bodyKey] };
                tripLogChanges[dbCol] = change;
                if (tripNotificationFields.includes(bodyKey)) {
                    // Check tolerance for notifications on Date fields
                    const isDate = bodyKey === 'departure_time'; // departure_time is the only date field here
                    const tolerance = isDate ? 60000 : 0;
                    if (isDiff(oldTripState[dbCol], body[bodyKey], tolerance)) {
                        tripNotificationChanges[dbCol] = change;
                    }
                }
            }
        }

        // Price Change Check (Log all changes, Notify only INCREASES)
        if (body.price !== undefined) {
            const oldPrice = parseFloat(oldTripState.price);
            const newPrice = parseFloat(body.price);

            // Check if price valid number and changed
            if (!isNaN(newPrice) && !isNaN(oldPrice) && newPrice !== oldPrice) {
                const change = { old: oldTripState.price, new: body.price };
                tripLogChanges['price'] = change;

                if (Number(newPrice.toFixed(2)) > Number(oldPrice.toFixed(2))) {
                    tripNotificationChanges.price = change;
                }
            }
        }

        // Locations (Special Handling)
        if (newFromText && isDiff(oldTripState.from_text, newFromText)) {
            const change = { old: oldTripState.from_text, new: newFromText };
            tripLogChanges['from_text'] = change;
            tripNotificationChanges['from_text'] = change;
        }
        if (newToText && isDiff(oldTripState.to_text, newToText)) {
            const change = { old: oldTripState.to_text, new: newToText };
            tripLogChanges['to_text'] = change;
            tripNotificationChanges['to_text'] = change;
        }

        // Rules Fields
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

        const ruleNotificationFields = [
            'pickupRules',
            'pickupRadius',
            'dropoffRadius',
            'paymentMethods',
            'paymentHandle',
            'cancellationPolicy',
            'cutoffTime',
            'payWindow',
            'startCheckInHrs',
            'flexibility',
        ];

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
                    if (!areIntervalsEqual(oldValue, newValue, 0)) { // Strict for logs (0 tolerance)
                        changed = true;
                    }
                } else {
                    if (isDiff(oldValue, newValue)) {
                        changed = true;
                    }
                }

                if (changed) {
                    const change = { old: oldValue, new: newValue };
                    ruleLogChanges[dbCol] = change;
                    if (ruleNotificationFields.includes(bodyKey)) {
                        let validForNotify = true;
                        // Check tolerance for notifications on Interval fields
                        if (intervalFields.includes(dbCol)) {
                            // Use 60 seconds tolerance for notifications
                            if (areIntervalsEqual(oldValue, newValue, 60000)) {
                                validForNotify = false; // "Equal" within tolerance -> Don't notify
                            }
                        }

                        if (validForNotify) {
                            ruleNotificationChanges[dbCol] = change;
                        }
                    }
                }
            }
        }

        // --- LOG CHANGES ---
        if (Object.keys(tripLogChanges).length > 0 || Object.keys(ruleLogChanges).length > 0) {
            const affected = [];
            const changesPayload: any = {};

            if (Object.keys(tripLogChanges).length > 0) {
                affected.push('trips');
                changesPayload.trip = tripLogChanges;
            }
            if (Object.keys(ruleLogChanges).length > 0) {
                affected.push('trip_rules');
                changesPayload.rules = ruleLogChanges;
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

        // --- SEND NOTIFICATIONS ---
        if (Object.keys(tripNotificationChanges).length > 0 || Object.keys(ruleNotificationChanges).length > 0) {
            const allChangedKeys = [
                ...Object.keys(tripNotificationChanges),
                ...Object.keys(ruleNotificationChanges),
            ];

            // List of fields that are considered "Payment Info"
            const paymentFields = ['payment_methods', 'payment_handle'];

            // Check if ONLY payment fields were changed
            const isOnlyPaymentUpdate = allChangedKeys.every(k => paymentFields.includes(k));

            // Notify Riders: Trip Info/Rules Updated
            const activeRidersForUpdate = await client.query(`
                SELECT rider, paid FROM bookings 
                WHERE trip = $1 
                AND status IN ('confirmed', 'joined_with_pay_window', 'pending_pay_confirmation_from_driver')
            `, [rideId]);

            for (const r of activeRidersForUpdate.rows) {
                // If the rider has PAID and the ONLY changes are payment info, SKIP notification
                if (r.paid && isOnlyPaymentUpdate) {
                    continue;
                }

                const tRider = await getTranslationForUser(r.rider, client);

                // Filter out payment fields from text
                const changedFieldKeys = allChangedKeys.filter(k => !paymentFields.includes(k));

                // Helper for type-safe label lookup
                const getFieldLabel = (key: string) => {
                    switch (key) {
                        case 'departure_time': return tRider('tripFields.departure_time');
                        case 'car': return tRider('tripFields.car');
                        case 'from_text': return tRider('tripFields.from_text');
                        case 'to_text': return tRider('tripFields.to_text');
                        case 'price': return tRider('tripFields.price');
                        // keys in allChangedKeys are DB columns (e.g. pickup_rules)
                        case 'pickup_rules': return tRider('tripFields.pickup_rules');
                        case 'pickup_radius_meters': return tRider('tripFields.pickup_radius_meters');
                        case 'drop_off_radius_meters': return tRider('tripFields.drop_off_radius_meters');
                        case 'cancellation_policy': return tRider('tripFields.cancellation_policy');
                        case 'cutoff_time': return tRider('tripFields.cutoff_time');
                        case 'pay_window': return tRider('tripFields.pay_window');
                        case 'start_check_in_hrs_before_departure': return tRider('tripFields.start_check_in_hrs_before_departure');
                        case 'departure_time_flexibility': return tRider('tripFields.departure_time_flexibility');
                        case 'notes': return tRider('tripFields.notes');
                        default: return key;
                    }
                };

                // Translate field labels
                const changedFieldLabels = changedFieldKeys.map(k => getFieldLabel(k)).filter(Boolean);

                let messageKey = 'notifications_dynamic.trip_updated.default';
                let variables = {};

                if (changedFieldLabels.length === 1) {
                    messageKey = 'notifications_dynamic.trip_updated.one';
                    variables = { field: changedFieldLabels[0] };
                } else if (changedFieldLabels.length > 1 && changedFieldLabels.length <= 3) {
                    messageKey = 'notifications_dynamic.trip_updated.many';
                    variables = { fields: changedFieldLabels.join(', ') };
                } else if (changedFieldLabels.length > 3) {
                    messageKey = 'notifications_dynamic.trip_updated.others';
                    variables = { fields: changedFieldLabels.slice(0, 2).join(', ') };
                }

                await createNotification({
                    client,
                    type: 'trip_updated',
                    titleKey: 'notifications.types.trip_updated.title',
                    messageKey,
                    variables,
                    userId: r.rider,
                    openLink: `/dashboard/${rideId}`,
                    entityType: 'trips',
                    entityId: rideId,
                    role: 'rider'
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
        const t = await getTranslation('en');
        return NextResponse.json({ error: error.message || t('api.errors.internalError') }, { status: 500 });
    } finally {
        client.release();
    }
}
