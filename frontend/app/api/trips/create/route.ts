import { NextResponse } from 'next/server';
import { pool } from '@/app/api/lib/db';
import dayjs, { CHICAGO_TZ } from '@/utils/dateUtils';
import { verifyUserFromRequest } from '@/app/api/lib/verifyUser';
import { checkAndProcessCheckInStart } from '@/app/api/lib/checkIn';
import { extractPublicArea } from '@/app/api/lib/extractPublicArea';
import { getTranslationForUser } from '@/app/api/lib/i18n';
import { processPaymentQRCode } from '@/app/api/lib/processQRCode';
import { processCarImage } from '@/app/api/lib/processCarImage';

// Helper to fetch Place Details from Google (New API)
async function fetchPlaceDetails(placeId: string, sessionToken: string) {
    const apiKey = process.env.SERVER_PLACES_KEY; // Server-side key
    if (!apiKey) throw new Error("SERVER_PLACES_KEY not configured");

    // Fields: location (lat/lng), formattedAddress
    const fields = 'location,formattedAddress';

    // Using the NEW Places API (v1)
    // GET https://places.googleapis.com/v1/places/{placeId}?fields=...&sessionToken=...
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

// Reverse geocode to get address components for neighborhood extraction
async function fetchGeocodeResult(lat: number, lng: number) {
    const apiKey = process.env.SERVER_PLACES_KEY;
    if (!apiKey) throw new Error("SERVER_PLACES_KEY not configured");

    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`;

    const res = await fetch(url);
    if (!res.ok) {
        const txt = await res.text();
        console.error(`Google Geocode Error (${lat},${lng}):`, txt);
        throw new Error(`Failed to fetch geocode result for ${lat},${lng}`);
    }

    const data = await res.json();
    return data.results?.[0] || null;
}

export async function POST(req: Request) {
    const client = await pool.connect();

    try {
        // 1. Auth Check
        const user = await verifyUserFromRequest(
            req.headers.get('authorization') ?? undefined
        );

        if (!user || !user.uid) {
            const t = await getTranslationForUser(null, client);
            return NextResponse.json({ error: t('api.errors.unauthorized') }, { status: 401 });
        }

        const t = await getTranslationForUser(user.uid, client);

        // Check for Global Profile
        const profileCheck = await client.query(
            `SELECT 1 FROM profile_global WHERE id = $1`,
            [user.uid]
        );

        if (profileCheck.rowCount === 0) {
            return NextResponse.json({
                error: t('api.errors.profileIncomplete'),
                code: 'PROFILE_INCOMPLETE'
            }, { status: 403 });
        }

        const body = await req.json();
        const {
            start, // { text, placeId, sessionToken }
            end,   // { text, placeId, sessionToken }
            departureTime,
            price,
            seats,
            car,   // { make, model, color, year, plate } (Optional if carId provided)
            carId, // UUID (Optional if car provided)
            paymentMethods,
            paymentHandle,
            paymentQRCodes, // { "Venmo": "data:image/...", "Zelle": "data:image/..." }
            bigLuggage,
            smallLuggage,
            bigLuggagePaid,
            smallLuggagePaid,
            bigLuggagePaidPrice,
            smallLuggagePaidPrice,
            autoAccept,
            flexibility,
            pickupRadius,
            dropoffRadius,
            pickupRules,
            cancellationPolicy,
            cutoffTime,
            payWindow,
            notes,
            saveTemplate,
            saveTripTemplate,
            linkTemplates,
            ruleTemplateName,
            tripTemplateName,
            startCheckInHrs,
            returnTime,
            tripTitle
        } = body;

        // Validation (Basic)
        // Require PlaceId OR (Lat + Lng)
        const startValid = (start?.placeId) || (start?.lat && start?.lng);
        const endValid = (end?.placeId) || (end?.lat && end?.lng);

        if (!startValid || !endValid || price === undefined || price === null || !seats) {
            return NextResponse.json({ error: t('api.errors.missingRequiredFieldsLocation') }, { status: 400 });
        }

        // Validate paid luggage: price must be > 0 if count > 0
        if ((bigLuggagePaid || 0) > 0 && !(bigLuggagePaidPrice > 0)) {
            return NextResponse.json({ error: 'Paid big luggage price must be greater than 0 when paid big luggage count is set.' }, { status: 400 });
        }
        if ((smallLuggagePaid || 0) > 0 && !(smallLuggagePaidPrice > 0)) {
            return NextResponse.json({ error: 'Paid small luggage price must be greater than 0 when paid small luggage count is set.' }, { status: 400 });
        }

        // Validate Departure Time (Must be in future relative to Chicago wall clock)
        const departureDate = dayjs.tz(departureTime, CHICAGO_TZ);
        const nowChicago = dayjs().tz(CHICAGO_TZ);

        if (departureDate.isBefore(nowChicago)) {
            return NextResponse.json({ error: t('api.errors.departureTimePast') }, { status: 400 });
        }

        // Expanded Validation: Confirm place string and ID validity IF provided
        if (start.placeId && (typeof start.placeId !== 'string' || start.placeId.trim() === '')) {
            return NextResponse.json({ error: t('api.errors.invalidStartLocationId') }, { status: 400 });
        }
        if (typeof start.text !== 'string' || start.text.trim() === '') {
            return NextResponse.json({ error: t('api.errors.invalidStartLocationName') }, { status: 400 });
        }
        if (end.placeId && (typeof end.placeId !== 'string' || end.placeId.trim() === '')) {
            return NextResponse.json({ error: t('api.errors.invalidDestinationId') }, { status: 400 });
        }
        if (typeof end.text !== 'string' || end.text.trim() === '') {
            return NextResponse.json({ error: t('api.errors.invalidDestinationName') }, { status: 400 });
        }

        // Car Validation: Check that if a new car is being added, it has basic info? 
        // Actually, we now allow NO CAR. So we just skip this check.
        // if (!carId && !car) ... REMOVED

        // 2. Resolve Locations (Fetch Google Details OR Use Provided Coords)
        const resolveLocation = async (loc: any) => {
            if (loc.placeId) {
                return fetchPlaceDetails(loc.placeId, loc.sessionToken);
            }
            // Use provided coordinates from Template
            return {
                location: { latitude: loc.lat, longitude: loc.lng },
                formattedAddress: loc.text
            };
        };

        const [startDetails, endDetails] = await Promise.all([
            resolveLocation(start),
            resolveLocation(end)
        ]);

        const startLat = startDetails.location.latitude;
        const startLng = startDetails.location.longitude;
        const endLat = endDetails.location.latitude;
        const endLng = endDetails.location.longitude;

        // Get exact addresses (driver-only: from_input_text, to_input_text)
        const fromInputText = startDetails.formattedAddress || start.text;
        const toInputText = endDetails.formattedAddress || end.text;


        // Use reverse geocoding to extract neighborhood names for public-facing from_text/to_text
        let fromText = fromInputText; // fallback
        let toText = toInputText; // fallback

        try {
            const [fromGeocode, toGeocode] = await Promise.all([
                fetchGeocodeResult(startLat, startLng),
                fetchGeocodeResult(endLat, endLng)
            ]);

            if (fromGeocode) {
                fromText = extractPublicArea(fromGeocode);
            }
            if (toGeocode) {
                toText = extractPublicArea(toGeocode);
            }
        } catch (geocodeError) {
            // If geocoding fails, use the full address as fallback
            console.warn('Geocoding failed, using full address:', geocodeError);
        }

        // 3. Database Transaction
        await client.query('BEGIN');

        let resolvedCarId: string | null = null;

        if (carId) {
            // VERIFY OWNERSHIP & FETCH CAPACITY
            const checkCar = await client.query(
                `SELECT id, seats, big_luggage, small_luggage FROM cars WHERE id = $1 AND owner = $2 AND deleted = false`,
                [carId, user.uid]
            );
            if (checkCar.rowCount === 0) {
                await client.query('ROLLBACK');
                return NextResponse.json({ error: t('api.errors.invalidCarId') }, { status: 400 });
            }
            const carDetails = checkCar.rows[0];
            resolvedCarId = carId;

            // VALIDATE CAPACITY AGAINST CAR
            if (seats > carDetails.seats) {
                await client.query('ROLLBACK');
                return NextResponse.json({
                    error: t('api.errors.seatsExceedCarCapacity', { seats, capacity: carDetails.seats })
                }, { status: 400 });
            }

            // // Validate Luggage Limits (if car has limits defined)
            // // This is now a soft limit, so we don't enforce it here
            // if (carDetails.big_luggage !== null && (bigLuggage || 0) > carDetails.big_luggage) {
            //     await client.query('ROLLBACK');
            //     return NextResponse.json({
            //         error: `Big luggage limit (${bigLuggage || 0}) exceeds car capacity (${carDetails.big_luggage}).`
            //     }, { status: 400 });
            // }
            // if (carDetails.small_luggage !== null && (smallLuggage || 0) > carDetails.small_luggage) {
            //     await client.query('ROLLBACK');
            //     return NextResponse.json({
            //         error: `Small luggage limit (${smallLuggage || 0}) exceeds car capacity (${carDetails.small_luggage}).`
            //     }, { status: 400 });
            // }

        } else if (car) {
            // Validation: New Car MUST have seats
            if (!car.seats || car.seats <= 0) {
                await client.query('ROLLBACK');
                return NextResponse.json({ error: t('api.errors.carSeatsRequired') }, { status: 400 });
            }

            // Validate Trip Seats against New Car Seats
            if (seats > car.seats) {
                await client.query('ROLLBACK');
                return NextResponse.json({
                    error: t('api.errors.seatsExceedCarCapacity', { seats, capacity: car.seats })
                }, { status: 400 });
            }
            // Validate Luggage against New Car
            // if ((car.big_luggage !== undefined && car.big_luggage !== null) && (bigLuggage || 0) > car.big_luggage) {
            //     await client.query('ROLLBACK');
            //     return NextResponse.json({
            //         error: `Big luggage limit (${bigLuggage || 0}) exceeds car capacity (${car.big_luggage}).`
            //     }, { status: 400 });
            // }
            // if ((car.small_luggage !== undefined && car.small_luggage !== null) && (smallLuggage || 0) > car.small_luggage) {
            //     await client.query('ROLLBACK');
            //     return NextResponse.json({
            //         error: `Small luggage limit (${smallLuggage || 0}) exceeds car capacity (${car.small_luggage}).`
            //     }, { status: 400 });
            // }

            // --- CAR DEDUPLICATION Logic (Existing) ---
            // Strategy: Look for an existing, non-deleted car for this user with matching Make, Model, Color, Year, Plate.
            // Plate equality check needs to handle NULLs if plate is optional, but for now we compare empty strings as matched.

            // Normalize
            const carMake = car.make.trim();
            const carModel = car.model.trim();
            const carColor = car.color.trim();
            const carYear = car.year.trim();
            const carPlate = (car.plate || '').trim();

            const findCarRes = await client.query(
                `SELECT id, make, model, color, year, plate 
                 FROM cars 
                 WHERE owner = $1 AND deleted = false`,
                [user.uid]
            );

            // Simple JS-side matching to avoid complex COALESCE SQL logic
            const existingCar = findCarRes.rows.find(c =>
                c.make === carMake &&
                c.model === carModel &&
                (c.color || '') === carColor &&
                (c.year || '') === carYear &&
                (c.plate || '') === carPlate
            );

            if (existingCar) {
                resolvedCarId = existingCar.id;
            } else {
                // Process car images if provided
                const picUrls: (string | null)[] = [];
                for (const picData of [car.pic1, car.pic2, car.pic3, car.pic4]) {
                    if (picData && typeof picData === 'string' && picData.startsWith('data:')) {
                        picUrls.push(await processCarImage(picData, user.uid));
                    } else if (picData && typeof picData === 'string' && picData.startsWith('https://')) {
                        picUrls.push(picData);
                    } else {
                        picUrls.push(null);
                    }
                }

                // Create New Car
                const newCarRes = await client.query(
                    `INSERT INTO cars (owner, make, model, color, year, plate, seats, big_luggage, small_luggage, pic1, pic2, pic3, pic4) 
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) 
                     RETURNING id`,
                    [
                        user.uid,
                        carMake,
                        carModel,
                        carColor,
                        carYear,
                        carPlate,
                        car.seats,
                        car.big_luggage || null,
                        car.small_luggage || null,
                        picUrls[0],
                        picUrls[1],
                        picUrls[2],
                        picUrls[3]
                    ]
                );
                resolvedCarId = newCarRes.rows[0].id;
            }
        }

        // --- INSERT TRIP ---
        const tripRes = await client.query(
            `INSERT INTO trips (
                driver, 
                car,
                price, 
                notes, 
                from_text, 
                to_text,
                from_input_text,
                to_input_text,
                origin_geog, 
                destination_geog, 
                departure_time, 
                total_seats,
                status,
                start_check_in,
                return_time,
                trip_title
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8,
                ST_SetSRID(ST_MakePoint($9, $10), 4326), 
                ST_SetSRID(ST_MakePoint($11, $12), 4326), 
                $13, $14, 'bookable', false, $15, $16
            ) RETURNING id`,
            [
                user.uid,
                resolvedCarId,
                price,
                notes,
                fromText,
                toText,
                fromInputText,
                toInputText,
                startLng, startLat,
                endLng, endLat,
                departureTime,
                seats,
                returnTime,
                tripTitle
            ]
        );

        const tripId = tripRes.rows[0].id;

        // --- PROCESS PAYMENT QR CODES ---
        let processedQRCodes: Record<string, string> = {};
        if (paymentQRCodes && typeof paymentQRCodes === 'object') {
            const methods = paymentMethods || [];
            for (const method of methods) {
                const qrData = paymentQRCodes[method];
                if (qrData && typeof qrData === 'string') {
                    if (qrData.startsWith('data:')) {
                        // New base64 upload - process it
                        const url = await processPaymentQRCode(qrData, user.uid, t);
                        processedQRCodes[method] = url;
                    } else if (qrData.startsWith('https://')) {
                        // Existing URL - keep it
                        processedQRCodes[method] = qrData;
                    }
                }
            }
        }

        // --- INSERT RULES ---
        // Insert Trip Rules
        await client.query(
            `INSERT INTO trip_rules(
                id,
                big_luggage_lim,
                small_luggage_lim,
                big_luggage_paid,
                small_luggage_paid,
                big_luggage_paid_price,
                small_luggage_paid_price,
                payment_methods,
                payment_handle,
                payment_qr_codes,
                auto_accept,
                departure_time_flexibility,
                pickup_radius_meters,
                drop_off_radius_meters,
                pickup_rules,
                cancellation_policy,
                cutoff_time,
                pay_window,
                start_check_in_hrs_before_departure
            ) VALUES(
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
                $14, $15, $16, $17, $18, $19
            )`,
            [
                tripId,
                bigLuggage || 0,
                smallLuggage || 0,
                bigLuggagePaid || 0,
                smallLuggagePaid || 0,
                bigLuggagePaidPrice || 0,
                smallLuggagePaidPrice || 0,
                paymentMethods || [],
                paymentHandle || null, // Optional now
                processedQRCodes, // JSONB with payment method -> URL mapping
                autoAccept,
                flexibility !== undefined && flexibility !== null ? flexibility : '15 minutes',
                pickupRadius,
                dropoffRadius,
                pickupRules || null,
                cancellationPolicy || null,
                cutoffTime !== undefined && cutoffTime !== null ? cutoffTime : '3 hours',
                payWindow !== undefined && payWindow !== null ? payWindow : '60 minutes',
                startCheckInHrs || null
            ]
        );

        // --- SAVE TEMPLATES ---
        if (saveTemplate || saveTripTemplate) {
            // Validation
            if (saveTemplate && (!ruleTemplateName || ruleTemplateName.trim() === '')) {
                await client.query('ROLLBACK');
                return NextResponse.json({ error: t('api.errors.ruleTemplateNameRequired') }, { status: 400 });
            }
            if (saveTripTemplate && (!tripTemplateName || tripTemplateName.trim() === '')) {
                await client.query('ROLLBACK');
                return NextResponse.json({ error: t('api.errors.tripTemplateNameRequired') }, { status: 400 });
            }

            let ruleTemplateId: number | null = null;

            // 1. Save Rule Template if requested
            if (saveTemplate) {
                const ruleTemplateRes = await client.query(
                    `INSERT INTO rule_templates(
                driver,
                name,
                big_luggage_lim,
                small_luggage_lim,
                big_luggage_paid,
                small_luggage_paid,
                big_luggage_paid_price,
                small_luggage_paid_price,
                payment_methods,
                payment_handle,
                auto_accept,
                departure_time_flexibility,
                pickup_radius_meters,
                drop_off_radius_meters,
                pickup_rules,
                cancellation_policy,
                cutoff_time,
                pay_window,
                start_check_in_hrs_before_departure
            ) VALUES(
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
                $14, $15, $16, $17, $18, $19
            ) RETURNING id`,
                    [
                        user.uid,
                        ruleTemplateName,
                        bigLuggage || 0,
                        smallLuggage || 0,
                        bigLuggagePaid || 0,
                        smallLuggagePaid || 0,
                        bigLuggagePaidPrice || 0,
                        smallLuggagePaidPrice || 0,
                        paymentMethods || [],
                        paymentHandle || null,
                        autoAccept,
                        flexibility !== undefined && flexibility !== null ? flexibility : '15 minutes',
                        pickupRadius,
                        dropoffRadius,
                        pickupRules || null,
                        cancellationPolicy || null,
                        cutoffTime !== undefined && cutoffTime !== null ? cutoffTime : '3 hours',
                        payWindow !== undefined && payWindow !== null ? payWindow : '60 minutes',
                        startCheckInHrs || null
                    ]
                );
                ruleTemplateId = ruleTemplateRes.rows[0].id;
            }

            // 2. Save Trip Template if requested
            if (saveTripTemplate) {
                // Determine linked rule: Only if linkTemplates is true AND we created a rule
                const linkedRuleId = (linkTemplates && ruleTemplateId) ? ruleTemplateId : null;

                await client.query(
                    `INSERT INTO trip_templates(
                driver,
                car,
                rule,
                price,
                name,
                notes,
                from_text,
                to_text,
                from_place_id,
                to_place_id,
                origin_geog,
                destination_geog,
                total_seats,
                return_time,
                trip_title
            ) VALUES(
                $1, $2, $3, $4, $5, $6, $7, $8, $14, $15,
                ST_SetSRID(ST_MakePoint($9, $10), 4326),
                ST_SetSRID(ST_MakePoint($11, $12), 4326),
                $13, $16, $17
            )`,
                    [
                        user.uid,
                        resolvedCarId,
                        linkedRuleId,
                        price,
                        tripTemplateName,
                        notes,
                        fromText,
                        toText,
                        startLng, startLat,
                        endLng, endLat,
                        seats,
                        start.placeId || null,
                        end.placeId || null,
                        returnTime,
                        tripTitle
                    ]
                );
            }
        }

        // Lazy Check-in Start (for immediate effect if created within window)
        await checkAndProcessCheckInStart(client, tripId);

        // --- LOG TRIP EVENT ---
        const { logTripEvent } = await import('@/app/api/lib/tripEvents');
        await logTripEvent({
            client,
            tripId,
            actorId: user.uid,
            eventType: 'trip_created',
            affectedEntities: ['trips', 'trip_rules'],
            changes: { // Initial snapshot could be full body or simplified
                trip: {
                    driver: user.uid,
                    price,
                    from_text: fromText,
                    to_text: toText,
                    departure_time: departureTime,
                    total_seats: seats
                },
                rules: {
                    big_luggage: bigLuggage || 0,
                    small_luggage: smallLuggage || 0,
                    auto_accept: autoAccept,
                    cutoff_time: cutoffTime || '3 hours'
                }
            }
        });

        await client.query('COMMIT');

        // --- FIND MATCHING RIDE REQUESTS AND NOTIFY ---
        // This runs after commit to avoid blocking the trip creation
        try {
            const { createNotification } = await import('@/app/api/lib/createNotification');

            // Query for matching ride requests:
            // 1. Origin within pickup radius
            // 2. Destination within dropoff radius
            // 3. Time overlap: (preferred_time - flexibility, preferred_time + flexibility) overlaps with
            //    (departure_time - trip_flexibility, departure_time + trip_flexibility)
            const tripFlexibility = flexibility !== undefined && flexibility !== null ? flexibility : '15 minutes';

            const matchingRequests = await client.query(`
                SELECT 
                    rr.requester_id,
                    rr.from_text as request_from,
                    rr.to_text as request_to,
                    rr.preferred_time,
                    rr.time_flexibility
                FROM ride_requests rr
                WHERE rr.status = 'active'
                  AND rr.expires_at > NOW()
                  -- Origin within pickup radius
                  AND ST_DWithin(
                      rr.origin_geog,
                      ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
                      $3::double precision
                  )
                  -- Destination within dropoff radius
                  AND ST_DWithin(
                      rr.destination_geog,
                      ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography,
                      $6::double precision
                  )
                  -- Time overlap check:
                  -- Request time range: (preferred_time - time_flexibility, preferred_time + time_flexibility)
                  -- Trip time range: (departure_time - trip_flexibility, departure_time + trip_flexibility)
                  -- Overlap exists if: request_start <= trip_end AND trip_start <= request_end
                  AND (rr.preferred_time - rr.time_flexibility) <= ($7::timestamptz + $8::interval)
                  AND ($7::timestamptz - $8::interval) <= (rr.preferred_time + rr.time_flexibility)
                  -- Don't notify the driver about their own requests
                  AND rr.requester_id != $9
            `, [
                startLng,
                startLat,
                pickupRadius,
                endLng,
                endLat,
                dropoffRadius,
                departureTime,
                tripFlexibility,
                user.uid
            ]);

            // Send notifications to matching requesters
            for (const request of matchingRequests.rows) {
                try {
                    await createNotification({
                        client,
                        userId: request.requester_id,
                        type: 'potential_match',
                        titleKey: 'notifications.types.potential_match.title',
                        messageKey: 'notifications.types.potential_match.message',
                        variables: {
                            from: fromText,
                            to: toText
                        },
                        entityType: 'trips',
                        entityId: tripId,
                        openLink: `/rides/${tripId}`,
                        role: 'rider'
                    });
                } catch (notifError) {
                    // Don't fail the trip creation if notification fails
                    console.error('Failed to send potential match notification:', notifError);
                }
            }

            if (matchingRequests.rowCount && matchingRequests.rowCount > 0) {
                console.log(`Sent potential match notifications to ${matchingRequests.rowCount} requesters for trip ${tripId}`);
            }
        } catch (matchError) {
            // Don't fail the trip creation if matching/notification fails
            console.error('Failed to process ride request matching:', matchError);
        }

        return NextResponse.json({ success: true, tripId });

    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error("Create Trip API Error:", error);

        const t = await getTranslationForUser(null, client);
        return NextResponse.json({ error: error.message || t('api.errors.internalError') }, { status: 500 });
    } finally {
        client.release();
    }
}
