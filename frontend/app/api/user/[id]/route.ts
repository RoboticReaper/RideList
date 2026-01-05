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
        // Levels: 0 = NONE (Redacted Name, No Phone), 1 = PARTIAL (Full Name, No Phone), 2 = FULL (Full Name, Full Phone)
        let accessLevel = 0;

        if (requesterUser) {
            if (requesterUser.uid === targetUserId) {
                accessLevel = 2;
            } else {
                // Fetch all shared trip/booking history
                // We fetch trip status, booking status, and other flags to determine relationship
                const historyRes = await pool.query(
                    `SELECT 
                        t.id as trip_id,
                        t.driver as trip_driver,
                        t.status as trip_status,
                        b.rider as booking_rider,
                        b.status as booking_status,
                        b.paid as booking_paid,
                        te.created_at as trip_end_event_at
                     FROM bookings b
                     JOIN trips t ON b.trip = t.id
                     LEFT JOIN LATERAL (
                        SELECT created_at 
                        FROM trip_events 
                        WHERE trip = t.id AND event_type IN ('trip_cancelled', 'trip_aborted')
                        ORDER BY created_at DESC 
                        LIMIT 1
                     ) te ON true
                     WHERE (t.driver = $1 AND b.rider = $2)
                        OR (t.driver = $2 AND b.rider = $1)`,
                    [requesterUser.uid, targetUserId]
                );

                const records = historyRes.rows;
                const activeTripStatuses = ['bookable', 'locked', 'full', 'departed'];
                const completedBookingStatuses = ['completed', 'no_show']; // Treated as active for Rider access view
                const activeBookingStatuses = ['joined_with_pay_window', 'pending_pay_confirmation_from_driver', 'confirmed', 'waiting_approval', ...completedBookingStatuses];

                // Check for ANY 'removed' status - Immediate Blocker
                const hasRemoval = records.some(r => r.booking_status === 'removed');

                if (!hasRemoval) {
                    for (const row of records) {
                        if (accessLevel === 2) break; // Already max access

                        const isRequesterDriver = row.trip_driver === requesterUser.uid;

                        if (isRequesterDriver) {
                            // Rule: Requester is Driver, Target is Rider
                            // Ref: "if trip status is active... always grant full access. if trip status is done, cancelled, or aborted, grant partial access."
                            // We assume 'active' implies the rider is actually ON the trip (not cancelled).


                            const isTripActive = activeTripStatuses.includes(row.trip_status);
                            const allowedBookingStatuses = [
                                'joined_with_pay_window',
                                'pending_pay_confirmation_from_driver',
                                'confirmed'
                            ];

                            if (isTripActive && allowedBookingStatuses.includes(row.booking_status)) {
                                accessLevel = 2;
                            } else {
                                accessLevel = 0;
                            }

                        } else {
                            // Rule: Requester is Rider, Target is Driver
                            // Ref: "use the same logic for determining finalAccess"

                            const isFullAccessStatus = activeBookingStatuses.includes(row.booking_status);
                            let cancelledPaidWithinGrace = false;

                            if (row.booking_status === 'cancelled' && row.trip_end_event_at) {
                                const isPaid = row.booking_paid;
                                const isWithinGracePeriod = new Date(row.trip_end_event_at) > new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
                                cancelledPaidWithinGrace = isPaid && isWithinGracePeriod;
                            }

                            if (isFullAccessStatus || cancelledPaidWithinGrace) {
                                accessLevel = 2;
                            }
                            // Rider never gets Partial access to Driver, only Full or None.
                        }
                    }
                } else {
                    accessLevel = 0;
                }
            }
        }

        // 4. Construct Response
        // Access Level 2: Unredacted Name, Unredacted Phone
        // Access Level 1: Unredacted Name, Redacted Phone
        // Access Level 0: Redacted Name, Redacted Phone

        const hasFullNameAccess = accessLevel >= 1;
        const hasPhoneAccess = accessLevel >= 2;

        let phone_privacy: 'VISIBLE' | 'REDACTED' | 'MISSING' = 'MISSING';
        if (!profile.phone) {
            phone_privacy = 'MISSING';
        } else if (hasPhoneAccess) {
            phone_privacy = 'VISIBLE';
        } else {
            phone_privacy = 'REDACTED';
        }

        const isOwner = requesterUser?.uid === targetUserId;
        const displayName = hasFullNameAccess ? profile.name : (profile.name ? (profile.name.substring(0, 3) + '***') : 'Anon');
        const displayPhone = hasPhoneAccess ? profile.phone : null;

        if (accessLevel === 2 || isOwner) {
            // Logic note: isOwner sets accessLevel to 2 above, but keeping explicit check for clarity/safety
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
            // Partial or None
            return NextResponse.json({
                id: profile.id,
                name: displayName,
                verified: profile.verified,
                created_at: profile.created_at,
                phone: displayPhone,
                photo_url: profile.photo_url,
                phone_privacy,
                rider_profile: {
                    default_big_luggage: null,
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
