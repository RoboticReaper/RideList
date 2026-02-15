import { NextResponse } from 'next/server';
import { pool } from '@/app/api/lib/db';
import dayjs, { CHICAGO_TZ } from '@/utils/dateUtils';
import { verifyUserFromRequest } from '@/app/api/lib/verifyUser';
import { getTranslationForUser } from '@/app/api/lib/i18n';
import { extractPublicArea } from '@/app/api/lib/extractPublicArea';

// Helper to fetch Place Details from Google (New API)
async function fetchPlaceDetails(placeId: string, sessionToken: string) {
    const apiKey = process.env.SERVER_PLACES_KEY;
    if (!apiKey) throw new Error("SERVER_PLACES_KEY not configured");

    const fields = 'location,formattedAddress';
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
            origin, // { text, placeId, sessionToken } or { text, lat, lng }
            destination, // { text, placeId, sessionToken } or { text, lat, lng }
            preferredTime,
            timeFlexibility, // e.g. "1 hour", "30 minutes"
            seats,
            price, // Optional
            expiresAt // Optional, defaults to 7 days from now
        } = body;

        // Validation (Basic)
        const originValid = (origin?.placeId) || (origin?.lat && origin?.lng);
        const destinationValid = (destination?.placeId) || (destination?.lat && destination?.lng);

        if (!originValid || !destinationValid) {
            return NextResponse.json({ error: t('api.errors.missingRequiredFieldsLocation') }, { status: 400 });
        }

        if (!preferredTime) {
            return NextResponse.json({ error: 'Preferred time is required' }, { status: 400 });
        }

        if (!timeFlexibility) {
            return NextResponse.json({ error: 'Time flexibility is required' }, { status: 400 });
        }

        if (!seats || seats < 1) {
            return NextResponse.json({ error: 'At least 1 seat is required' }, { status: 400 });
        }

        // Validate preferred time (Must be in future relative to Chicago wall clock)
        const preferredDate = dayjs.tz(preferredTime, CHICAGO_TZ);
        const nowChicago = dayjs().tz(CHICAGO_TZ);

        if (preferredDate.isBefore(nowChicago)) {
            return NextResponse.json({ error: t('api.errors.departureTimePast') }, { status: 400 });
        }

        // Validate location text
        if (typeof origin.text !== 'string' || origin.text.trim() === '') {
            return NextResponse.json({ error: t('api.errors.invalidStartLocationName') }, { status: 400 });
        }
        if (typeof destination.text !== 'string' || destination.text.trim() === '') {
            return NextResponse.json({ error: t('api.errors.invalidDestinationName') }, { status: 400 });
        }

        // 2. Resolve Locations (Fetch Google Details OR Use Provided Coords)
        const resolveLocation = async (loc: any) => {
            if (loc.placeId) {
                return fetchPlaceDetails(loc.placeId, loc.sessionToken);
            }
            // Use provided coordinates
            return {
                location: { latitude: loc.lat, longitude: loc.lng },
                formattedAddress: loc.text
            };
        };

        const [originDetails, destinationDetails] = await Promise.all([
            resolveLocation(origin),
            resolveLocation(destination)
        ]);

        const originLat = originDetails.location.latitude;
        const originLng = originDetails.location.longitude;
        const destLat = destinationDetails.location.latitude;
        const destLng = destinationDetails.location.longitude;

        // Use reverse geocoding to extract neighborhood names for public-facing from_text/to_text
        let fromText = originDetails.formattedAddress || origin.text;
        let toText = destinationDetails.formattedAddress || destination.text;

        try {
            const [fromGeocode, toGeocode] = await Promise.all([
                fetchGeocodeResult(originLat, originLng),
                fetchGeocodeResult(destLat, destLng)
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

        // Calculate expires_at (default to preferredTime if not provided)
        const expiresAtDate = expiresAt
            ? dayjs.tz(expiresAt, CHICAGO_TZ).toISOString()
            : preferredDate.toISOString();

        // 3. Database Insert
        await client.query('BEGIN');

        const insertRes = await client.query(
            `INSERT INTO ride_requests (
                requester_id,
                origin_geog,
                destination_geog,
                from_text,
                to_text,
                preferred_time,
                time_flexibility,
                seats,
                price,
                status,
                expires_at
            ) VALUES (
                $1,
                ST_SetSRID(ST_MakePoint($2, $3), 4326),
                ST_SetSRID(ST_MakePoint($4, $5), 4326),
                $6,
                $7,
                $8,
                $9::interval,
                $10,
                $11,
                'active',
                $12
            ) RETURNING id`,
            [
                user.uid,
                originLng, originLat, // Note: MakePoint takes (lng, lat)
                destLng, destLat,
                fromText,
                toText,
                preferredTime,
                timeFlexibility,
                seats,
                price || null,
                expiresAtDate
            ]
        );

        const requestId = insertRes.rows[0].id;

        await client.query('COMMIT');

        return NextResponse.json({ success: true, requestId });

    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error("Create Ride Request API Error:", error);

        // Check for the max active requests constraint violation
        if (error.message?.includes('Maximum of 5 active ride requests')) {
            return NextResponse.json({
                error: 'Maximum of 5 active ride requests allowed per user',
                code: 'MAX_REQUESTS_EXCEEDED'
            }, { status: 400 });
        }

        const t = await getTranslationForUser(null, client);
        return NextResponse.json({ error: error.message || t('api.errors.internalError') }, { status: 500 });
    } finally {
        client.release();
    }
}

export async function GET(req: Request) {
    const client = await pool.connect();

    try {
        // Auth Check
        const user = await verifyUserFromRequest(
            req.headers.get('authorization') ?? undefined
        );

        if (!user || !user.uid) {
            const t = await getTranslationForUser(null, client);
            return NextResponse.json({ error: t('api.errors.unauthorized') }, { status: 401 });
        }

        // Fetch active ride requests for this user
        const result = await client.query(
            `SELECT 
                id,
                from_text,
                to_text,
                ST_Y(origin_geog::geometry) as origin_lat,
                ST_X(origin_geog::geometry) as origin_lng,
                ST_Y(destination_geog::geometry) as dest_lat,
                ST_X(destination_geog::geometry) as dest_lng,
                preferred_time,
                time_flexibility,
                seats,
                price,
                status,
                created_at,
                expires_at
            FROM ride_requests
            WHERE requester_id = $1 AND status = 'active'
            ORDER BY created_at DESC`,
            [user.uid]
        );

        return NextResponse.json({
            success: true,
            requests: result.rows
        });

    } catch (error: any) {
        console.error("Get Ride Requests API Error:", error);
        const t = await getTranslationForUser(null, client);
        return NextResponse.json({ error: error.message || t('api.errors.internalError') }, { status: 500 });
    } finally {
        client.release();
    }
}

export async function PATCH(req: Request) {
    const client = await pool.connect();

    try {
        // Auth Check
        const user = await verifyUserFromRequest(
            req.headers.get('authorization') ?? undefined
        );

        if (!user || !user.uid) {
            const t = await getTranslationForUser(null, client);
            return NextResponse.json({ error: t('api.errors.unauthorized') }, { status: 401 });
        }

        const t = await getTranslationForUser(user.uid, client);

        const body = await req.json();
        const { requestId, status } = body;

        if (!requestId) {
            return NextResponse.json({ error: 'Request ID is required' }, { status: 400 });
        }

        // Validate status transition
        const validStatuses = ['active', 'fulfilled', 'expired', 'deleted'];
        if (!status || !validStatuses.includes(status)) {
            return NextResponse.json({
                error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
            }, { status: 400 });
        }

        // Verify ownership and get current status
        const checkRes = await client.query(
            `SELECT id, status FROM ride_requests WHERE id = $1 AND requester_id = $2`,
            [requestId, user.uid]
        );

        if (checkRes.rowCount === 0) {
            return NextResponse.json({ error: 'Ride request not found or unauthorized' }, { status: 404 });
        }

        const currentStatus = checkRes.rows[0].status;

        // Validate status transitions
        // Users can only transition from 'active' to other statuses
        if (currentStatus !== 'active' && status !== currentStatus) {
            return NextResponse.json({
                error: 'Can only modify active ride requests'
            }, { status: 400 });
        }

        // Update the status
        await client.query(
            `UPDATE ride_requests SET status = $1 WHERE id = $2`,
            [status, requestId]
        );

        return NextResponse.json({ success: true, status });

    } catch (error: any) {
        console.error("Update Ride Request API Error:", error);
        const t = await getTranslationForUser(null, client);
        return NextResponse.json({ error: error.message || t('api.errors.internalError') }, { status: 500 });
    } finally {
        client.release();
    }
}
