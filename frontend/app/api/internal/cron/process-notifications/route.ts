
import { NextResponse } from 'next/server';
import { pool } from '@/app/api/lib/db';
import { checkAndProcessCheckInStart } from '@/app/api/lib/checkIn';
import { checkAndProcessPayWindowTimeout } from '@/app/api/lib/payWindow';
import { checkAndProcessTripCutoff } from '@/app/api/lib/tripCutoff';

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

        // Stats to return
        const stats = {
            pay_timeouts: 0,
            checkins_started: 0, // Includes auto-depart etc processed by checkIn check
            cutoffs: 0
        };

        // ------------------------------------------------------------------
        // 1. Process Pay Window Expiry
        // ------------------------------------------------------------------
        // Find bookings that MIGHT be timed out.
        // We do a loose check here to find candidates, then let the helper doing strict checking + locking.
        // SKIP LOCKED ensures we don't block or process same row twice if multiple cron jobs run.
        const payTimeoutCandidates = await client.query(`
            SELECT b.id 
            FROM bookings b
            JOIN booking_rule_snapshot r ON b.id = r.id
            JOIN trips t ON b.trip = t.id
            WHERE b.status = 'joined_with_pay_window'
              AND NOW() > b.created_at + r.pay_window
              AND t.status NOT IN ('cancelled', 'aborted', 'departed')
            LIMIT 50 -- Batch size to avoid long trans
            FOR UPDATE SKIP LOCKED
        `);

        for (const row of payTimeoutCandidates.rows) {
            // Helper handles re-validation, locking (safe re-entrant), and logic
            await checkAndProcessPayWindowTimeout(client, row.id);
            stats.pay_timeouts++;
        }

        // ------------------------------------------------------------------
        // 2. Process Trip Cutoff (Auto-Lock)
        // ------------------------------------------------------------------
        // Find trips that are bookable and past their cutoff time
        const cutoffCandidates = await client.query(`
            SELECT t.id
            FROM trips t
            LEFT JOIN trip_rules tr ON t.id = tr.id
            WHERE t.status = 'bookable'
              AND (
                CASE 
                    WHEN tr.cutoff_time IS NOT NULL THEN (NOW() >= (t.departure_time + COALESCE(tr.departure_time_flexibility, '0 seconds'::interval) - tr.cutoff_time))
                    ELSE (NOW() >= (t.departure_time + COALESCE(tr.departure_time_flexibility, '0 seconds'::interval)))
                END
              )
            LIMIT 50
            FOR UPDATE SKIP LOCKED
        `);

        for (const row of cutoffCandidates.rows) {
            await checkAndProcessTripCutoff(client, row.id);
            stats.cutoffs++;
        }

        // ------------------------------------------------------------------
        // 3. Process Check-In Start / Auto-Depart / Auto-Complete / Warnings
        // ------------------------------------------------------------------
        // This group uses checkAndProcessCheckInStart which has become a "Lazy State Processor".
        // It handles:
        // A. Start Check-in (start_check_in=false, time passed)
        // B. Auto-Complete (status=departed, 12h passed)
        // C. Auto-Depart (status=bookable/locked/full, late > 15m)
        // D. Tardy Warning (status=bookable/locked/full, late > 0m & < 15m)

        // We construct a query to catch ALL these candidates.
        const generalCandidates = await client.query(`
            WITH trip_candidates AS (
                SELECT t.id
                FROM trips t
                WHERE
                    -- A. Check-in Start Candidate
                    (
                        t.start_check_in = false
                        AND t.status NOT IN ('cancelled', 'aborted', 'completed', 'done')
                        AND EXISTS (
                            SELECT 1
                            FROM trip_rules tr
                            WHERE tr.id = t.id
                            AND NOW() >= t.departure_time - tr.start_check_in_hrs_before_departure
                        )
                    )

                    OR

                    -- B. Auto-Complete Candidate
                    (
                        t.status = 'departed'
                        AND t.actual_departure_time IS NOT NULL
                        AND NOW() >= t.actual_departure_time + INTERVAL '12 hours'
                    )

                    OR

                    -- C & D. Auto-Depart / Tardy Warning Candidate
                    (
                        t.status IN ('bookable', 'locked', 'full')
                        AND t.car IS NOT NULL
                        AND EXISTS (
                            SELECT 1
                            FROM trip_rules tr
                            WHERE tr.id = t.id
                            AND NOW() > t.departure_time + COALESCE(tr.departure_time_flexibility, '0 seconds'::interval)
                        )
                    )

                ORDER BY t.departure_time
                LIMIT 50
                FOR UPDATE SKIP LOCKED
            )

            SELECT id
            FROM trip_candidates;

        `);

        for (const row of generalCandidates.rows) {
            await checkAndProcessCheckInStart(client, row.id);
            stats.checkins_started++;
        }

        await client.query('COMMIT');

        return NextResponse.json({
            success: true,
            processed: stats
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Cron processing error:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    } finally {
        client.release();
    }
}
