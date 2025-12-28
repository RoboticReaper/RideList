import { NextResponse } from 'next/server';
import { pool } from '@/app/api/lib/db';
import { verifyUserFromRequest } from '@/app/api/lib/verifyUser';

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

export async function POST(req: Request) {
    const client = await pool.connect();

    try {
        // 1. Auth Check
        const user = await verifyUserFromRequest(
            req.headers.get('authorization') ?? undefined
        );

        if (!user || !user.uid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Check for Global Profile
        const profileCheck = await client.query(
            `SELECT 1 FROM profile_global WHERE id = $1`,
            [user.uid]
        );

        if (profileCheck.rowCount === 0) {
            return NextResponse.json({
                error: 'Profile incomplete',
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
            bigLuggage,
            smallLuggage,
            autoAccept,
            flexibility,
            pickupRadius,
            dropoffRadius,
            pickupRules,
            cancellationPolicy,
            cutoffTime,
            notes,
            saveTemplate,
            saveTripTemplate,
            linkTemplates,
            ruleTemplateName,
            tripTemplateName
        } = body;

        // Validation (Basic)
        // Require PlaceId OR (Lat + Lng)
        const startValid = (start?.placeId) || (start?.lat && start?.lng);
        const endValid = (end?.placeId) || (end?.lat && end?.lng);

        if (!startValid || !endValid || price === undefined || price === null || !seats) {
            return NextResponse.json({ error: 'Missing required fields (Location or PlaceID required)' }, { status: 400 });
        }

        // Expanded Validation: Confirm place string and ID validity IF provided
        if (start.placeId && (typeof start.placeId !== 'string' || start.placeId.trim() === '')) {
            return NextResponse.json({ error: 'Invalid Start Location ID' }, { status: 400 });
        }
        if (typeof start.text !== 'string' || start.text.trim() === '') {
            return NextResponse.json({ error: 'Invalid Start Location Name' }, { status: 400 });
        }
        if (end.placeId && (typeof end.placeId !== 'string' || end.placeId.trim() === '')) {
            return NextResponse.json({ error: 'Invalid Destination ID' }, { status: 400 });
        }
        if (typeof end.text !== 'string' || end.text.trim() === '') {
            return NextResponse.json({ error: 'Invalid Destination Name' }, { status: 400 });
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

        const fromText = startDetails.formattedAddress || start.text;
        const toText = endDetails.formattedAddress || end.text;

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
                return NextResponse.json({ error: 'Invalid Car ID' }, { status: 400 });
            }
            const carDetails = checkCar.rows[0];
            resolvedCarId = carId;

            // VALIDATE CAPACITY AGAINST CAR
            if (seats > carDetails.seats) {
                await client.query('ROLLBACK');
                return NextResponse.json({
                    error: `Trip seats (${seats}) cannot exceed car capacity (${carDetails.seats}).`
                }, { status: 400 });
            }

            // Validate Luggage Limits (if car has limits defined)
            if (carDetails.big_luggage !== null && (bigLuggage || 0) > carDetails.big_luggage) {
                await client.query('ROLLBACK');
                return NextResponse.json({
                    error: `Big luggage limit (${bigLuggage || 0}) exceeds car capacity (${carDetails.big_luggage}).`
                }, { status: 400 });
            }
            if (carDetails.small_luggage !== null && (smallLuggage || 0) > carDetails.small_luggage) {
                await client.query('ROLLBACK');
                return NextResponse.json({
                    error: `Small luggage limit (${smallLuggage || 0}) exceeds car capacity (${carDetails.small_luggage}).`
                }, { status: 400 });
            }

        } else if (car) {
            // Validation: New Car MUST have seats
            if (!car.seats || car.seats <= 0) {
                await client.query('ROLLBACK');
                return NextResponse.json({ error: 'Car Information must include number of seats.' }, { status: 400 });
            }

            // Validate Trip Seats against New Car Seats
            if (seats > car.seats) {
                await client.query('ROLLBACK');
                return NextResponse.json({
                    error: `Trip seats (${seats}) cannot exceed car capacity (${car.seats}).`
                }, { status: 400 });
            }
            // Validate Luggage against New Car
            if ((car.big_luggage !== undefined && car.big_luggage !== null) && (bigLuggage || 0) > car.big_luggage) {
                await client.query('ROLLBACK');
                return NextResponse.json({
                    error: `Big luggage limit (${bigLuggage || 0}) exceeds car capacity (${car.big_luggage}).`
                }, { status: 400 });
            }
            if ((car.small_luggage !== undefined && car.small_luggage !== null) && (smallLuggage || 0) > car.small_luggage) {
                await client.query('ROLLBACK');
                return NextResponse.json({
                    error: `Small luggage limit (${smallLuggage || 0}) exceeds car capacity (${car.small_luggage}).`
                }, { status: 400 });
            }

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
                // Create New Car
                const newCarRes = await client.query(
                    `INSERT INTO cars (owner, make, model, color, year, plate, seats, big_luggage, small_luggage) 
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
                     RETURNING id`,
                    [
                        user.uid,
                        carMake,
                        carModel,
                        carColor,
                        carYear,
                        carPlate,
                        car.seats,  // Use CAR seats
                        car.big_luggage || null,
                        car.small_luggage || null
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
                origin_geog, 
                destination_geog, 
                departure_time, 
                total_seats,
                status
            ) VALUES (
                $1, $2, $3, $4, $5, $6,
                ST_SetSRID(ST_MakePoint($7, $8), 4326), 
                ST_SetSRID(ST_MakePoint($9, $10), 4326), 
                $11, $12, 'bookable'
            ) RETURNING id`,
            [
                user.uid,
                resolvedCarId,
                price,
                notes,
                fromText,
                toText,
                startLng, startLat,
                endLng, endLat,
                departureTime,
                seats
            ]
        );

        const tripId = tripRes.rows[0].id;

        // --- INSERT RULES ---
        // Insert Trip Rules
        await client.query(
            `INSERT INTO trip_rules (
                id, 
                big_luggage_lim, 
                small_luggage_lim, 
                payment_methods, 
                payment_handle, 
                auto_accept, 
                departure_time_flexibility, 
                pickup_radius_meters, 
                drop_off_radius_meters,
                pickup_rules,
                cancellation_policy,
                cutoff_time
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
            )`,
            [
                tripId,
                bigLuggage || 0,
                smallLuggage || 0,
                paymentMethods || [],
                paymentHandle || null, // Optional now
                autoAccept,
                flexibility,
                pickupRadius,
                dropoffRadius,
                pickupRules || null,
                cancellationPolicy || null,
                cutoffTime || null
            ]
        );

        // --- SAVE TEMPLATES ---
        if (saveTemplate || saveTripTemplate) {
            // Validation
            if (saveTemplate && (!ruleTemplateName || ruleTemplateName.trim() === '')) {
                await client.query('ROLLBACK');
                return NextResponse.json({ error: 'Rule Template name is required.' }, { status: 400 });
            }
            if (saveTripTemplate && (!tripTemplateName || tripTemplateName.trim() === '')) {
                await client.query('ROLLBACK');
                return NextResponse.json({ error: 'Trip Template name is required.' }, { status: 400 });
            }

            let ruleTemplateId: number | null = null;

            // 1. Save Rule Template if requested
            if (saveTemplate) {
                const ruleTemplateRes = await client.query(
                    `INSERT INTO rule_templates (
                        driver,
                        name,
                        big_luggage_lim,
                        small_luggage_lim,
                        payment_methods,
                        payment_handle,
                        auto_accept,
                        departure_time_flexibility,
                        pickup_radius_meters,
                        drop_off_radius_meters,
                        pickup_rules,
                        cancellation_policy,
                        cutoff_time
                    ) VALUES (
                        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
                    ) RETURNING id`,
                    [
                        user.uid,
                        ruleTemplateName,
                        bigLuggage || 0,
                        smallLuggage || 0,
                        paymentMethods || [],
                        paymentHandle || null,
                        autoAccept,
                        flexibility,
                        pickupRadius,
                        dropoffRadius,
                        pickupRules || null,
                        cancellationPolicy || null,
                        cutoffTime || null
                    ]
                );
                ruleTemplateId = ruleTemplateRes.rows[0].id;
            }

            // 2. Save Trip Template if requested
            if (saveTripTemplate) {
                // Determine linked rule: Only if linkTemplates is true AND we created a rule
                const linkedRuleId = (linkTemplates && ruleTemplateId) ? ruleTemplateId : null;

                await client.query(
                    `INSERT INTO trip_templates (
                        driver,
                        car,
                        rule,
                        price,
                        name,
                        notes,
                        from_text,
                        to_text,
                        origin_geog,
                        destination_geog,
                        total_seats
                    ) VALUES (
                        $1, $2, $3, $4, $5, $6, $7, $8, 
                        ST_SetSRID(ST_MakePoint($9, $10), 4326), 
                        ST_SetSRID(ST_MakePoint($11, $12), 4326), 
                        $13
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
                        seats
                    ]
                );
            }
        }

        await client.query('COMMIT');

        return NextResponse.json({ success: true, tripId });

    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error("Create Trip API Error:", error);

        // Debug Logging
        const fs = require('fs');
        fs.appendFileSync('debug_error.txt', `\n[${new Date().toISOString()}] Error: ${error.message}\nStack: ${error.stack}\n`);

        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    } finally {
        client.release();
    }
}
