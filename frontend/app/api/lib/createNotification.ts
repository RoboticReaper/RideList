import { PoolClient } from 'pg';

interface CreateNotificationArgs {
    client: PoolClient;
    type: string;
    title: string;
    message: string;
    userId: string | null; // who should receive the notification
    openLink: string; // link to open when notification is clicked
    entityType: "trips" | "bookings";
    entityId: string;
    role: "driver" | "rider" | "global"; // role of the user
}

export const NOTIFICATION_TYPES = {
    DRIVER: {
        // Critical / transactional / time-sensitive
        // Cannot be disabled
        ALWAYS_REMIND: [
            'new_booking',                     // rider joined trip
            'payment_marked',                  // rider marked payment, needs confirmation
            'rider_left',                      // rider left
            'rider_ready',                     // rider checked in as ready
            'trip_auto_locked',                // system locked trip (cutoff)
            'booking_updated',                 // rider updated booking details after check-in
        ],

        // Informational / reminders
        // Respect driver settings
        OPTIONAL_REMIND: [
            'trip_full',                       // seats full
            'pay_timeout',                     // rider pay timed-out
        ]
    },

    RIDER: {
        // Critical / transactional / time-sensitive
        // Cannot be disabled
        ALWAYS_REMIND: [
            'booking_rejected',                 // driver rejected booking (auto-reject was off)
            'pay_window_started',               // pay window opened. ALSO means booking_accepted
            'pay_timeout',                      // booking auto-cancelled
            'booking_confirmed',                // driver confirmed payment
            'booking_removed',                  // driver removed rider
            'trip_cancelled',                   // driver cancelled trip
            'trip_aborted',                     // trip aborted after departure
            'check_in_started',                 // check-in enabled
            'trip_departed',                    // driver started pickup
            'marked_no_show',                   // rider marked as no-show
            'picked_up',                        // rider picked up
            'driver_contact_changed',           // driver changed phone number
            'vehicle_updated',                  // driver updated vehicle information
        ],

        // Informational / reminders
        // Respect rider settings
        OPTIONAL_REMIND: [
            'trip_updated',                     // trip info/rules changed
            'trip_completed'
        ]
    }
};


// handles checking user preferences to see if they should actually be notified
export async function createNotification({
    client,
    type,
    title,
    message,
    userId,
    entityType,
    entityId,
    openLink,
    role
}: CreateNotificationArgs): Promise<boolean> {
    // check user preferences to see if they should be notified.
    // example result of querying settings_driver's notification jsonb:
    // {
    //     'trip_full': true,
    //     'pay_timeout': false,
    // }
    // check whether to actually send based on user preferences
    // gate keep optional reminders that aren't enabled

    if (!userId) {
        return false;
    }

    const isValidType =
        NOTIFICATION_TYPES.DRIVER.ALWAYS_REMIND.includes(type) ||
        NOTIFICATION_TYPES.DRIVER.OPTIONAL_REMIND.includes(type) ||
        NOTIFICATION_TYPES.RIDER.ALWAYS_REMIND.includes(type) ||
        NOTIFICATION_TYPES.RIDER.OPTIONAL_REMIND.includes(type);

    if (!isValidType) {
        console.warn(`Unknown notification type: ${type}`);
        return false;
    }

    if (role === 'driver') {
        if (NOTIFICATION_TYPES.DRIVER.OPTIONAL_REMIND.includes(type)) {
            const query = `
                SELECT notifications FROM settings_driver WHERE id = $1
            `;
            const res = await client.query(query, [userId]);
            if (res.rows.length !== 0) {
                const prefs = res.rows[0].notifications || {};
                if (prefs[type] === false) {
                    return false; // explicitly disabled
                }
            }
        }
    } else if (role === 'rider') {
        if (NOTIFICATION_TYPES.RIDER.OPTIONAL_REMIND.includes(type)) {
            const query = `
                SELECT notifications FROM settings_rider WHERE id = $1
            `;
            const res = await client.query(query, [userId]);
            if (res.rows.length !== 0) {
                const prefs = res.rows[0].notifications || {};
                if (prefs[type] === false) {
                    return false; // explicitly disabled
                }
            }
        }
    }

    const query = `
        INSERT INTO notifications (
            user_id, 
            type, 
            title, 
            body, 
            entity_type, 
            entity_id,
            open_link
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
    `;

    const res = await client.query(query, [
        userId,
        type,
        title,
        message,
        entityType,
        entityId,
        openLink
    ]);

    // =========================================================
    // PUSH NOTIFICATION FAN-OUT (Best Effort)
    // =========================================================
    // Rules:
    // 1. Sending push is secondary to DB insert (already done).
    // 2. Only send to devices with permission_state = 'granted' AND push_enabled = true.
    // 3. Respect invalidated_at.
    // 4. Privacy: Payload should be minimal.

    try {
        // Fetch valid tokens
        const deviceQuery = `
            SELECT id, fcm_token FROM user_devices
            WHERE user_id = $1
              AND permission_state = 'granted'
              AND push_enabled = true
              AND invalidated_at IS NULL
              AND fcm_token IS NOT NULL
        `;
        const devices = await client.query(deviceQuery, [userId]);

        if (devices.rows.length === 0) {
            return true; // No pushable devices, but notification saved.
        }

        const tokens = devices.rows.map(row => row.fcm_token);
        // Map token back to device ID for error handling
        const tokenToDeviceId = new Map(devices.rows.map(row => [row.fcm_token, row.id]));

        // Import statically to avoid circular deps if any (though best practice is top-level)
        const { adminMessaging } = await import('@/app/api/lib/firebase-admin');

        // We use sendEachForMulticast for batch sending
        // Note: tokens list can be up to 500. If > 500, need chunking. 
        // Assuming < 500 active devices per user is safe.
        const pushResponse = await adminMessaging.sendEachForMulticast({
            tokens: tokens,
            notification: {
                title: title,
                body: message,
            },
            webpush: {
                fcmOptions: {
                    link: openLink
                }
            },
            data: {
                // Minimal data for client handling if needed
                type: type,
                entityId: entityId,
                entityType: entityType,
                open_link: openLink
            }
        });

        if (pushResponse.failureCount > 0) {
            const invalidTokens: string[] = [];
            pushResponse.responses.forEach((resp, idx) => {
                if (!resp.success) {
                    const errorCode = resp.error?.code;
                    // Check for invalid token errors
                    if (errorCode === 'messaging/registration-token-not-registered' ||
                        errorCode === 'messaging/invalid-registration-token') {
                        invalidTokens.push(tokens[idx]);
                    }
                    console.warn(`FCM send error for user ${userId}:`, resp.error);
                }
            });

            if (invalidTokens.length > 0) {
                // Invalidate devices in DB
                // This is critical to stop spamming invalid tokens
                const deviceIdsToInvalidate = invalidTokens.map(t => tokenToDeviceId.get(t)).filter(Boolean);

                if (deviceIdsToInvalidate.length > 0) {
                    await client.query(`
                        UPDATE user_devices
                        SET 
                            invalidated_at = NOW(),
                            push_enabled = false
                        WHERE id = ANY($1)
                    `, [deviceIdsToInvalidate]);
                }
            }
        }

    } catch (pushError) {
        // NEVER fail the main operation because push failed
        console.error("Critical error in push fan-out:", pushError);
    }

    return true;
}
