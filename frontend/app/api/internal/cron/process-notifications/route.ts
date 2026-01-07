
import { NextResponse } from 'next/server';
import { pool } from '@/app/api/lib/db';
import { createNotification } from '@/app/api/lib/createNotification';

// Security: Verify CRON_SECRET header
const CRON_SECRET = process.env.CRON_SECRET;

export async function POST(req: Request) {
    if (req.method !== 'POST') {
        return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const authHeader = req.headers.get('x-cron-secret');
    if (authHeader !== CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Process Pay Window Expiry
        // Idempotency Strategy: 
        // Select bookings where status is 'joined_with_pay_window' AND expiry time has passed.
        // Update status to 'pay_timeout'. 
        // Returning ID ensures we process exactly what we updated, so no duplicate notifications.

        const timeoutRows = await client.query(`
            WITH expired_bookings AS (
                SELECT b.id, b.rider, b.trip, t.driver
                FROM bookings b
                JOIN trips t ON b.trip = t.id
                JOIN booking_rule_snapshot r ON b.id = r.id
                WHERE b.status = 'joined_with_pay_window'
                AND NOW() > b.created_at + r.pay_window
                AND t.status NOT IN ('cancelled', 'aborted')
                FOR UPDATE SKIP LOCKED
            ),
            updated_bookings AS (
                UPDATE bookings
                SET status = 'pay_timeout'
                FROM expired_bookings
                WHERE bookings.id = expired_bookings.id
                RETURNING bookings.id, bookings.rider, bookings.trip, expired_bookings.driver as driver
            )
            SELECT * FROM updated_bookings
        `);

        for (const booking of timeoutRows.rows) {
            await client.query(`
                INSERT INTO booking_status_history (
                booking_id,
                actor_id,
                old_status,
                new_status,
                trigger_event_id
                )
                VALUES ($1, NULL, 'joined_with_pay_window', 'pay_timeout', NULL);
            `, [booking.id]);
            // Notify Rider
            await createNotification({
                client,
                type: 'pay_timeout',
                title: 'Booking Expired',
                message: 'Your payment window has expired.',
                userId: booking.rider,
                entityType: 'bookings',
                entityId: booking.id,
                openLink: `/dashboard/${booking.trip}`,
                role: 'rider'
            });

            // TODO: Notify Driver logic (if required by spec)
            await createNotification({
                client,
                type: 'pay_timeout',
                title: 'Rider Booking Expired',
                message: 'Your rider has timed out on their payment window.',
                userId: booking.driver,
                entityType: 'bookings',
                entityId: booking.id,
                openLink: `/dashboard/${booking.trip}`,
                role: 'driver'
            });
        }

        // 2. Process Auto Check-in Start
        // Idempotency Strategy:
        // Select trips where start_check_in is false AND time has passed.
        // Update start_check_in to true.
        // Return IDs to trigger notifications.

        const tripsStartingCheckIn = await client.query(`
            WITH trips_to_open AS (
                SELECT t.id, t.driver, t.departure_time
                FROM trips t
                JOIN trip_rules r ON t.id = r.id
                WHERE t.start_check_in = false
                AND t.status != 'cancelled'
                AND t.status != 'aborted'
                AND NOW() >= t.departure_time - r.start_check_in_hrs_before_departure
                FOR UPDATE SKIP LOCKED
            ),
            opened_trips AS (
                UPDATE trips
                SET start_check_in = true
                FROM trips_to_open
                WHERE trips.id = trips_to_open.id
                RETURNING trips.id, trips.driver
            )
            SELECT * FROM opened_trips
        `);

        for (const trip of tripsStartingCheckIn.rows) {
            // Fan out to all bookings to notify 'check_in_started'
            // Query active bookings for this trip
            const bookingsRes = await client.query(`
                SELECT rider, id FROM bookings 
                WHERE trip = $1 
                AND status IN ('joined_with_pay_window', 'pending_pay_confirmation_from_driver', 'confirmed')
             `, [trip.id]);

            for (const booking of bookingsRes.rows) {
                await createNotification({
                    client,
                    type: 'check_in_started',
                    title: 'Check-in Started',
                    message: 'Check-in for your trip has started.',
                    userId: booking.rider,
                    entityType: 'trips',
                    entityId: trip.id,
                    openLink: `/dashboard/${trip.id}`,
                    role: 'rider'
                });
            }

        }

        await client.query('COMMIT');

        const processedCount = timeoutRows.rowCount! + tripsStartingCheckIn.rowCount!;

        return NextResponse.json({
            success: true,
            processed: {
                pay_timeouts: timeoutRows.rowCount,
                checkins_started: tripsStartingCheckIn.rowCount
            }
        });


    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Cron processing error:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    } finally {
        client.release();
    }
}
