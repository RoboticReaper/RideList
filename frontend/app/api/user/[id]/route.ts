import { NextResponse } from 'next/server';
import { pool } from '@/app/api/lib/db';
import { verifyUserFromRequest } from '@/app/api/lib/verifyUser';
import { createNotification } from '@/app/api/lib/createNotification';
import { bucket, adminAuth } from '@/app/api/lib/firebase-admin'; // Add import
import sharp from 'sharp';


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

        // 2. Fetch Public Profile Stats
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
        // Levels: 
        // 0 = NONE (Redacted Name, No Phone, No Photo) -> "The Stranger/Past History" View
        // 2 = FULL (Full Name, Full Phone, Photo) -> "The Active/Recent" View
        let accessLevel = 0;

        if (requesterUser) {
            if (requesterUser.uid === targetUserId) {
                accessLevel = 2; // Owner always sees self
            } else {
                // Fetch shared history to determine "Active" or "Recent" status
                // Added 'trip_completed' to the event lookup to handle normal trip grace periods
                const historyRes = await pool.query(
                    `SELECT 
                        t.id as trip_id,
                        t.status as trip_status,
                        b.status as booking_status,
                        te.created_at as trip_end_event_at
                     FROM bookings b
                     JOIN trips t ON b.trip = t.id
                     LEFT JOIN LATERAL (
                        SELECT created_at 
                        FROM trip_events 
                        WHERE trip = t.id 
                        AND event_type IN ('trip_cancelled', 'trip_aborted', 'trip_completed')
                        ORDER BY created_at DESC 
                        LIMIT 1
                     ) te ON true
                     WHERE (t.driver = $1 AND b.rider = $2)
                        OR (t.driver = $2 AND b.rider = $1)`,
                    [requesterUser.uid, targetUserId]
                );

                const records = historyRes.rows;

                // 1. Immediate Blocker: Removal
                // If they were ever removed from a car, they get BLOCKED (Level 0), regardless of other active trips.
                const hasRemoval = records.some(r => r.booking_status === 'removed');

                if (!hasRemoval) {
                    const now = new Date();
                    const GRACE_PERIOD_MS = 24 * 60 * 60 * 1000; // 24 Hours

                    // Status definitions
                    const activeTripStatuses = ['bookable', 'locked', 'full', 'departed'];
                    const activeBookingStatuses = [
                        'joined_with_pay_window',
                        'pending_pay_confirmation_from_driver',
                        'confirmed',
                        'waiting_approval'
                    ];

                    for (const row of records) {
                        if (accessLevel === 2) break; // Already max access

                        // Check A: Is this an active, ongoing interaction?
                        const isActiveTrip = activeTripStatuses.includes(row.trip_status);
                        const isActiveBooking = activeBookingStatuses.includes(row.booking_status);
                        const isCurrentlyActive = isActiveTrip && isActiveBooking;

                        // Check B: Did it finish recently? (The "Left Item" / "Coordination" Window)
                        let isRecent = false;
                        if (row.trip_end_event_at) {
                            const timeSinceEnd = now.getTime() - new Date(row.trip_end_event_at).getTime();
                            isRecent = timeSinceEnd < GRACE_PERIOD_MS;
                        }

                        if (isCurrentlyActive || isRecent) {
                            accessLevel = 2;
                        }
                        // Note: We deliberately do NOT fall back to Level 1. 
                        // If it's old (>24h), we want it to return to Level 0 (Anon) for profile browsing privacy.
                    }
                }
            }
        }

        // 4. Construct Response (Redaction Logic)

        const hasFullNameAccess = accessLevel >= 1; // Covered by Level 2
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

        // Redaction:
        // Level 2/Owner: "John Smith"
        // Level 0: "Joh***" (or "Anon" if short name)
        const displayName = hasFullNameAccess ? profile.name : (profile.name ? (profile.name.substring(0, 3) + '***') : 'Anon');

        // Phone:
        // Level 2/Owner: "+1555..."
        // Level 0: null
        const displayPhone = hasPhoneAccess ? profile.phone : null;

        // Photo:
        // Level 2/Owner: URL
        // Level 0: null (Privacy)
        const displayPhoto = (accessLevel === 2 || isOwner) ? profile.photo_url : null;

        return NextResponse.json({
            id: profile.id,
            name: displayName,
            verified: profile.verified,
            created_at: profile.created_at, // Public info (member since) is usually safe
            phone: displayPhone,
            photo_url: displayPhoto,
            phone_privacy,
            // Stats are public, preferences are private
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
    const client = await pool.connect();

    try {
        const user = await verifyUserFromRequest(
            req.headers.get('authorization') ?? undefined
        );

        if (user.uid !== targetUserId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const body = await req.json();
        const { name, phone, rider_config, profile_image_base64 } = body;

        // Basic validation
        if (!name || name.trim() === "") {
            return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
        }

        let newPhotoUrl = null;
        if (profile_image_base64) {
            try {
                // Feature: Delete old photo if exists
                const existingProfile = await client.query('SELECT photo_url FROM profile_global WHERE id = $1', [targetUserId]);
                const existingPhotoUrl = existingProfile.rows[0]?.photo_url;

                if (existingPhotoUrl) {
                    try {
                        // Extract path from URL
                        // Format: https://storage.googleapis.com/[BUCKET]/[PATH]
                        // OR if using standard firebase pattern
                        const bucketName = bucket.name;
                        // Simple check: does it contain our bucket name?
                        if (existingPhotoUrl.includes(bucketName)) {
                            // Split by bucket name and grab the rest
                            // URL: https://storage.googleapis.com/ridelist-e9048.firebasestorage.app/profile_photos/user/123.jpg
                            // Split: ...app/ -> profile_photos/user/123.jpg
                            const parts = existingPhotoUrl.split(`${bucketName}/`);
                            if (parts.length > 1) {
                                const oldFilePath = decodeURIComponent(parts[1]);
                                await bucket.file(oldFilePath).delete();
                            }
                        }
                    } catch (deleteErr) {
                        console.warn("Failed to delete old profile photo:", deleteErr);
                        // Continue ensuring new photo is uploaded
                    }
                }

                // Expecting data:image/jpeg;base64,...
                const matches = profile_image_base64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);

                if (matches && matches.length === 3) {
                    let contentType = matches[1];
                    let imageBuffer: any = Buffer.from(matches[2], 'base64');

                    // Compression Logic for large files (> 5MB)
                    if (imageBuffer.byteLength > 5 * 1024 * 1024) {
                        console.log(`Compressing image (Original: ${(imageBuffer.byteLength / 1024 / 1024).toFixed(2)}MB)`);
                        try {
                            imageBuffer = await sharp(imageBuffer)
                                .resize({
                                    width: 1920,
                                    height: 1920,
                                    fit: 'inside',
                                    withoutEnlargement: true
                                })
                                .jpeg({ quality: 80 })
                                .toBuffer();
                            contentType = 'image/jpeg';
                            console.log(`Compression complete (New: ${(imageBuffer.byteLength / 1024 / 1024).toFixed(2)}MB)`);
                        } catch (compErr) {
                            console.error("Compression failed, proceeding with original:", compErr);
                            // If compression fails, we try to proceed with original or could throw
                        }
                    }

                    const filename = `profile_photos/${targetUserId}/${Date.now()}.jpg`; // Force jpg extension or derive? keeping simple for now
                    const file = bucket.file(filename);

                    await file.save(imageBuffer as any, {
                        metadata: { contentType: contentType },
                        public: true, // Make public
                    });

                    // Construct public URL
                    // "https://storage.googleapis.com/[BUCKET_NAME]/[OBJECT_NAME]" is standard public link
                    // Or use file.publicUrl() if available (bucket.file object sometimes implies authenticated access only unless properly configured)
                    // The standard firebase pattern:
                    newPhotoUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`;
                }
            } catch (uploadError) {
                console.error("Image upload failed:", uploadError);
                // Non-blocking? Or fail? Let's fail for now to alert user
                return NextResponse.json({ error: 'Image upload failed' }, { status: 500 });
            }
        }

        // Fetch current phone to check for changes
        const currentProfileRes = await client.query('SELECT phone, photo_url FROM profile_global WHERE id = $1', [targetUserId]);
        const oldPhone = currentProfileRes.rows[0]?.phone;
        const currentPhotoUrl = currentProfileRes.rows[0]?.photo_url;

        const photoUrlToSave = newPhotoUrl || currentPhotoUrl;

        // Update Global Profile
        const updateGlobalRes = await client.query(
            `UPDATE profile_global 
             SET name = $1, phone = $2, photo_url = $3
             WHERE id = $4 
             RETURNING id, name, phone, verified, created_at, photo_url`,
            [name, phone || null, photoUrlToSave, targetUserId]
        );

        if (updateGlobalRes.rowCount === 0) {
            return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
        }

        // Update Rider Profile (Upsert)
        if (rider_config) {
            await client.query(
                `INSERT INTO profile_rider (id, default_big_luggage, default_small_luggage)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (id) DO UPDATE 
                 SET default_big_luggage = $2, default_small_luggage = $3`,
                [targetUserId, rider_config.default_big_luggage || 0, rider_config.default_small_luggage || 0]
            );
        }

        // Sync Photo URL to Firebase Auth
        if (photoUrlToSave) {
            try {
                await adminAuth.updateUser(targetUserId, {
                    photoURL: photoUrlToSave
                });
            } catch (authErr) {
                console.error("Failed to sync photo URL to Firebase Auth:", authErr);
                // Non-blocking, just log it
            }
        }

        // Notify Riders if phone changed
        const newPhone = phone || null;
        if (newPhone?.trim() !== oldPhone?.trim()) {
            // Find active trips and bookings
            const activeBookingsRes = await client.query(`
                SELECT b.rider, b.trip 
                FROM bookings b
                JOIN trips t ON b.trip = t.id
                WHERE t.driver = $1
                  AND t.status IN ('bookable', 'full', 'locked', 'departed')
                  AND b.status IN ('confirmed', 'joined_with_pay_window', 'pending_pay_confirmation_from_driver')
            `, [targetUserId]);

            for (const row of activeBookingsRes.rows) {
                await createNotification({
                    client,
                    type: 'driver_contact_changed',
                    title: 'Driver Contact Updated',
                    message: 'Your driver has updated their phone number.',
                    userId: row.rider,
                    openLink: `/rides/${row.trip}`,
                    entityType: 'trips',
                    entityId: row.trip,
                    role: 'rider'
                });
            }
        }

        // Fetch fresh full profile to return
        // We could reuse the GET logic but simpler to just fetch again to ensure consistency
        const profileRes = await client.query(
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
    } finally {
        client.release();
    }
}
