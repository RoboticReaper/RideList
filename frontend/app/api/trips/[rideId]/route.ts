
import { NextResponse } from 'next/server';
import { pool } from '@/app/api/lib/db';
import { verifyUserFromRequest } from '@/app/api/lib/verifyUser';

export async function GET(
    req: Request,
    { params }: { params: Promise<{ rideId: string }> }
) {
    const { rideId } = await params;
    const client = await pool.connect();

    try {
        const query = `
      SELECT 
        -- Trip Info
        t.id,
        t.price,
        t.notes,
        t.from_text,
        t.to_text,
        ST_AsGeoJSON(t.origin_geog) as origin_geog,
        ST_AsGeoJSON(t.destination_geog) as destination_geog,
        t.departure_time,
        t.total_seats,
        t.seats_taken,
        t.status,
        t.created_at,
        t.modified_at,
        
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
        
        -- Car Info
        c.id as car_id,
        c.make as car_make,
        c.model as car_model,
        c.color as car_color,
        c.year as car_year,
        c.plate as car_plate,
        
        -- Driver Info
        pg.id as driver_id,
        pg.name as driver_name,
        pg.verified as driver_verified,
        pg.photo_url as driver_photo_url,
        pg.created_at as driver_since,
        pd.rating_cached as driver_rating,
        pd.completed_trips as driver_completed_trips

      FROM trips t
      LEFT JOIN trip_rules tr ON t.id = tr.id
      LEFT JOIN cars c ON t.car = c.id
      LEFT JOIN profile_global pg ON t.driver = pg.id
      LEFT JOIN profile_driver pd ON t.driver = pd.id
      WHERE t.id = $1
    `;

        const result = await client.query(query, [rideId]);

        if (result.rowCount === 0) {
            return NextResponse.json({ error: 'Ride not found' }, { status: 404 });
        }

        const row = result.rows[0];

        // Auth check for driver view
        const user = await verifyUserFromRequest(req.headers.get('authorization') ?? undefined);
        const isDriver = user && user.uid === row.driver_id;

        // --- Redaction Logic ---
        // If driver, show full name. If public, redacted.
        const displayName = isDriver ? row.driver_name : (row.driver_name ? (row.driver_name.substring(0, 3) + '***') : 'Anon');

        const ride = {
            id: row.id,
            isDriver, // Flag for frontend
            status: row.status,
            // ... rest of fields ...
            created_at: row.created_at,
            modified_at: row.modified_at,

            // Trip Details
            from_text: row.from_text,
            to_text: row.to_text,
            origin_geog: row.origin_geog ? JSON.parse(row.origin_geog) : null,
            destination_geog: row.destination_geog ? JSON.parse(row.destination_geog) : null,
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
                // Plate is usually private until booked, let's hide it for public unless driver
                plate: isDriver ? row.car_plate : null
            } : null,

            // Driver Details (Public/Redacted)
            driver: {
                id: row.driver_id,
                name: displayName,
                verified: row.driver_verified,
                photo_url: row.driver_photo_url,
                member_since: row.driver_since,
                rating: row.driver_rating ?? null,
                completed_trips: row.driver_completed_trips ?? 0
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
                time_flexibility: row.departure_time_flexibility,
                payment: {
                    methods: row.payment_methods,
                    handle: row.payment_handle // TODO: Maybe redact this if it's sensitive?
                },
                auto_accept: row.auto_accept,
                cancellation_policy: row.cancellation_policy,
                cutoff_time: row.cutoff_time
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

        // Check ownership
        const tripCheck = await client.query('SELECT driver FROM trips WHERE id = $1 FOR UPDATE', [rideId]);
        if (tripCheck.rowCount === 0) {
            await client.query('ROLLBACK');
            return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
        }
        if (tripCheck.rows[0].driver !== user.uid) {
            await client.query('ROLLBACK');
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Update TRIPS table
        // Fields: price, seats (total_seats), notes, car, departure_time, from_text, to_text, origin_geog, destination_geog
        if (body.price !== undefined || body.total_seats !== undefined || body.notes !== undefined ||
            body.car !== undefined || body.departure_time !== undefined ||
            body.from_text !== undefined || body.to_text !== undefined ||
            body.from_place_id !== undefined || body.to_place_id !== undefined) {

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

            // Handle Start Location (Place ID -> Geog AND Text)
            if (body.from_place_id) {
                const details = await fetchPlaceDetails(body.from_place_id, body.from_session_token || '');
                const lat = details.location.latitude;
                const lng = details.location.longitude;
                const text = details.formattedAddress || body.from_text;

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
                updates.push(`from_text = $${idx++}`);
                values.push(body.from_text);
            }

            // Handle End Location (Place ID -> Geog AND Text)
            if (body.to_place_id) {
                const details = await fetchPlaceDetails(body.to_place_id, body.to_session_token || '');
                const lat = details.location.latitude;
                const lng = details.location.longitude;
                const text = details.formattedAddress || body.to_text;

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
                updates.push(`to_text = $${idx++}`);
                values.push(body.to_text);
            }


            if (updates.length > 0) {
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
            paymentHandle: 'payment_handle'
        };

        let rIdx = 1;
        for (const [key, col] of Object.entries(mapping)) {
            if (body[key] !== undefined) {
                rulesUpdates.push(`${col} = $${rIdx++}`);
                rulesValues.push(body[key]);
            }
        }

        if (rulesUpdates.length > 0) {
            rulesValues.push(rideId);
            await client.query(`UPDATE trip_rules SET ${rulesUpdates.join(', ')} WHERE id = $${rIdx}`, rulesValues);
        }

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
