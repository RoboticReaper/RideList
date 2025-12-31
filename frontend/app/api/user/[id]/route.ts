import { NextResponse } from 'next/server';
import { pool } from '@/app/api/lib/db';
import { verifyUserFromRequest } from '@/app/api/lib/verifyUser';

export async function GET(
    req: Request,
    { params }: { params: { id: string } }
) {
    const waitedParams = await params;
    const targetUserId = waitedParams.id;

    try {
        // 1. Get Requester User (Optional)
        let requesterUser = null;
        try {
            requesterUser = await verifyUserFromRequest(
                req.headers.get('authorization') ?? undefined
            );
        } catch (e) {
            // Ignore auth errors, treat as guest
        }

        // 2. Fetch Profile
        const profileRes = await pool.query(
            `SELECT 
                pg.id, pg.name, pg.verified, pg.created_at, pg.phone, pg.photo_url,
                pr.default_big_luggage, pr.default_small_luggage, pr.rating_cached as rider_rating, pr.completed_rides,
                pd.rating_cached as driver_rating, pd.completed_trips
             FROM profile_global pg
             LEFT JOIN profile_rider pr ON pg.id = pr.id
             LEFT JOIN profile_driver pd ON pg.id = pd.id
             WHERE pg.id = $1`,
            [targetUserId]
        );

        if (profileRes.rowCount === 0) {
            return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
        }

        let profile = profileRes.rows[0];



        // 3. Determine Visibility
        let hasFullAccess = false;

        if (requesterUser) {
            if (requesterUser.uid === targetUserId) {
                hasFullAccess = true;
            } else {
                // Check for shared booking relationship
                // Requester can be Driver (trips.driver) OR Rider (bookings.rider)
                // Target must be the counter-part on the SAME trip/booking.

                // Query: Check if there exists a booking 'b' on trip 't' where:
                // (t.driver = requester AND b.rider = target) OR (t.driver = target AND b.rider = requester)
                const relationshipRes = await pool.query(
                    `SELECT 1 FROM bookings b
                    JOIN trips t ON b.trip = t.id
                    WHERE (t.driver = $1 AND b.rider = $2)
                        OR (t.driver = $2 AND b.rider = $1)
                    LIMIT 1`,
                    [requesterUser.uid, targetUserId]
                );

                if (relationshipRes.rowCount && relationshipRes.rowCount > 0) {
                    hasFullAccess = true;
                }
            }
        }

        // 4. Construct Response
        let phone_privacy: 'VISIBLE' | 'REDACTED' | 'MISSING' = 'MISSING';
        if (!profile.phone) {
            phone_privacy = 'MISSING';
        } else if (hasFullAccess) {
            phone_privacy = 'VISIBLE';
        } else {
            phone_privacy = 'REDACTED';
        }

        const isOwner = requesterUser?.uid === targetUserId;

        if (hasFullAccess) {
            // Return full profile
            return NextResponse.json({
                id: profile.id,
                name: profile.name,
                verified: profile.verified,
                created_at: profile.created_at,
                phone: profile.phone,
                photo_url: profile.photo_url,
                phone_privacy,
                rider_profile: {
                    default_big_luggage: isOwner ? (profile.default_big_luggage ?? 0) : null,
                    default_small_luggage: isOwner ? (profile.default_small_luggage ?? 0) : null,
                    rating: profile.rider_rating ?? null,
                    completed_rides: profile.completed_rides ?? 0
                },
                driver_profile: {
                    rating: profile.driver_rating ?? null,
                    completed_trips: profile.completed_trips ?? 0
                }
            });
        } else {
            // Redact information
            const redactedName = profile.name ? (profile.name.substring(0, 3) + '***') : 'Anon';

            return NextResponse.json({
                id: profile.id,
                name: redactedName,
                verified: profile.verified,
                created_at: profile.created_at,
                phone: null, // Redacted
                photo_url: profile.photo_url,
                phone_privacy,
                rider_profile: {
                    default_big_luggage: null, // Never visible to non-full-access (and actually never visible to anyone but owner per logic above)
                    default_small_luggage: null,
                    rating: profile.rider_rating ?? null,
                    completed_rides: profile.completed_rides ?? 0
                },
                driver_profile: {
                    rating: profile.driver_rating ?? null,
                    completed_trips: profile.completed_trips ?? 0
                }
            });
        }

    } catch (error) {
        console.error("Get Global Profile Error:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function PATCH(
    req: Request,
    { params }: { params: { id: string } }
) {
    const waitedParams = await params;
    const targetUserId = waitedParams.id;

    try {
        const user = await verifyUserFromRequest(
            req.headers.get('authorization') ?? undefined
        );

        if (user.uid !== targetUserId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const body = await req.json();
        const { name, phone, rider_config } = body;

        // Basic validation
        if (!name || name.trim() === "") {
            return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
        }

        // Update Global Profile
        const updateGlobalRes = await pool.query(
            `UPDATE profile_global 
             SET name = $1, phone = $2 
             WHERE id = $3 
             RETURNING id, name, phone, verified, created_at, photo_url`,
            [name, phone || null, targetUserId]
        );

        if (updateGlobalRes.rowCount === 0) {
            return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
        }

        // Update Rider Profile (Upsert)
        if (rider_config) {
            await pool.query(
                `INSERT INTO profile_rider (id, default_big_luggage, default_small_luggage)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (id) DO UPDATE 
                 SET default_big_luggage = $2, default_small_luggage = $3`,
                [targetUserId, rider_config.default_big_luggage || 0, rider_config.default_small_luggage || 0]
            );
        }

        // Fetch fresh full profile to return
        // We could reuse the GET logic but simpler to just fetch again to ensure consistency
        const profileRes = await pool.query(
            `SELECT 
                pg.id, pg.name, pg.verified, pg.created_at, pg.phone, pg.photo_url,
                pr.default_big_luggage, pr.default_small_luggage, pr.rating_cached as rider_rating, pr.completed_rides,
                pd.rating_cached as driver_rating, pd.completed_trips
             FROM profile_global pg
             LEFT JOIN profile_rider pr ON pg.id = pr.id
             LEFT JOIN profile_driver pd ON pg.id = pd.id
             WHERE pg.id = $1`,
            [targetUserId]
        );
        const profile = profileRes.rows[0];

        return NextResponse.json({
            id: profile.id,
            name: profile.name,
            verified: profile.verified,
            created_at: profile.created_at,
            phone: profile.phone,
            photo_url: profile.photo_url,
            phone_privacy: profile.phone ? 'VISIBLE' : 'MISSING',
            rider_profile: {
                default_big_luggage: profile.default_big_luggage ?? 0,
                default_small_luggage: profile.default_small_luggage ?? 0,
                rating: profile.rider_rating ?? null,
                completed_rides: profile.completed_rides ?? 0
            },
            driver_profile: {
                rating: profile.driver_rating ?? null,
                completed_trips: profile.completed_trips ?? 0
            }
        });

    } catch (error) {
        console.error("Update Global Profile Error:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
