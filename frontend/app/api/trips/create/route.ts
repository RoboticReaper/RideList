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
            notes
        } = body;

        // Validation (Basic)
        if (!start?.placeId || !end?.placeId || !price || !seats) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Expanded Validation: Confirm place string and ID validity
        if (typeof start.placeId !== 'string' || start.placeId.trim() === '') {
            return NextResponse.json({ error: 'Invalid Start Location ID' }, { status: 400 });
        }
        if (typeof start.text !== 'string' || start.text.trim() === '') {
            return NextResponse.json({ error: 'Invalid Start Location Name' }, { status: 400 });
        }
        if (typeof end.placeId !== 'string' || end.placeId.trim() === '') {
            return NextResponse.json({ error: 'Invalid Destination ID' }, { status: 400 });
        }
        if (typeof end.text !== 'string' || end.text.trim() === '') {
            return NextResponse.json({ error: 'Invalid Destination Name' }, { status: 400 });
        }

        // Car Validation: Either carId (existing) OR car (new) must be present
        if (!carId && !car) {
            return NextResponse.json({ error: 'Missing car information' }, { status: 400 });
        }

        // 2. Fetch Layout/Lng from Google using SERVER Key
        // Parallel fetch for speed
        const [startDetails, endDetails] = await Promise.all([
            fetchPlaceDetails(start.placeId, start.sessionToken),
            fetchPlaceDetails(end.placeId, end.sessionToken)
        ]);

        const startLat = startDetails.location.latitude;
        const startLng = startDetails.location.longitude;
        const endLat = endDetails.location.latitude;
        const endLng = endDetails.location.longitude;

        const fromText = startDetails.formattedAddress || start.text; // Prefer official address
        const toText = endDetails.formattedAddress || end.text;

        // 3. Database Transaction
        await client.query('BEGIN');

        let resolvedCarId: string;

        if (carId) {
            // VERIFY OWNERSHIP
            const checkCar = await client.query(
                `SELECT id FROM cars WHERE id = $1 AND owner = $2 AND deleted = false`,
                [carId, user.uid]
            );
            if (checkCar.rowCount === 0) {
                await client.query('ROLLBACK');
                return NextResponse.json({ error: 'Invalid Car ID' }, { status: 400 });
            }
            resolvedCarId = carId;
        } else {
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
                    `INSERT INTO cars (owner, make, model, color, year, plate, seats) 
                     VALUES ($1, $2, $3, $4, $5, $6, $7) 
                     RETURNING id`,
                    [user.uid, carMake, carModel, carColor, carYear, carPlate, seats]
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
                seats_left, 
                status
            ) VALUES (
                $1, $2, $3, $4, $5, $6,
                ST_SetSRID(ST_MakePoint($7, $8), 4326), 
                ST_SetSRID(ST_MakePoint($9, $10), 4326), 
                $11, $12, $12, 'bookable'
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
