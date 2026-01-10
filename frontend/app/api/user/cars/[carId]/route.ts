import { NextResponse } from 'next/server';
import { pool } from '@/app/api/lib/db';
import { verifyUserFromRequest } from '@/app/api/lib/verifyUser';
import { createNotification } from '@/app/api/lib/createNotification';
import { getTranslationForUser } from '@/app/api/lib/i18n';

export async function GET(req: Request, { params }: { params: Promise<{ carId: string }> }) {
    const { carId } = await params;
    const client = await pool.connect();
    try {
        const user = await verifyUserFromRequest(
            req.headers.get('authorization') ?? undefined
        );

        if (!user || !user.uid) {
            const t = await getTranslationForUser(null, client);
            return NextResponse.json({ error: t('api.errors.unauthorized') }, { status: 401 });
        }

        const t = await getTranslationForUser(user.uid, client);

        const res = await client.query(
            `SELECT * FROM cars WHERE id = $1 AND owner = $2 AND deleted = false`,
            [carId, user.uid]
        );

        if (res.rowCount === 0) {
            return NextResponse.json({ error: t('api.errors.carNotFoundExact') }, { status: 404 });
        }

        return NextResponse.json({ car: res.rows[0] });
    } catch (error: any) {
        console.error(error);
        const t = await getTranslationForUser(null, client); // Check usage
        return NextResponse.json({ error: t('api.errors.internalError') }, { status: 500 });
    } finally {
        client.release();
    }
}

export async function PUT(req: Request, { params }: { params: Promise<{ carId: string }> }) {
    const { carId } = await params;
    const client = await pool.connect();
    try {
        const user = await verifyUserFromRequest(
            req.headers.get('authorization') ?? undefined
        );

        if (!user || !user.uid) {
            const t = await getTranslationForUser(null, client);
            return NextResponse.json({ error: t('api.errors.unauthorized') }, { status: 401 });
        }

        const t = await getTranslationForUser(user.uid, client);

        const body = await req.json();
        const { make, model, color, year, plate, seats, big_luggage, small_luggage } = body;

        // Fetch current car details to check for changes
        const currentCarRes = await client.query(
            `SELECT * FROM cars WHERE id = $1 AND owner = $2 AND deleted = false`,
            [carId, user.uid]
        );
        const currentCar = currentCarRes.rows[0];

        if (!currentCar) {
            return NextResponse.json({ error: t('api.errors.carNotFoundExact') }, { status: 404 });
        }

        const res = await client.query(
            `UPDATE cars 
             SET make = $1, model = $2, color = $3, year = $4, plate = $5, seats = $6, big_luggage = $7, small_luggage = $8
             WHERE id = $9 AND owner = $10 AND deleted = false
             RETURNING *`,
            [make, model, color, year, plate, seats, big_luggage, small_luggage, carId, user.uid]
        );

        if (res.rowCount === 0) {
            return NextResponse.json({ error: t('api.errors.carNotFoundExact') }, { status: 404 });
        }

        // Check for relevant changes and notify riders
        const hasCarChanges =
            currentCar.make !== make ||
            currentCar.model !== model ||
            currentCar.color !== color ||
            currentCar.year !== year ||
            currentCar.plate !== plate;

        if (hasCarChanges) {
            const activeBookingsRes = await client.query(`
                SELECT b.rider, b.trip 
                FROM bookings b
                JOIN trips t ON b.trip = t.id
                WHERE t.car = $1
                  AND t.status IN ('bookable', 'full', 'locked', 'departed')
                  AND b.status IN ('confirmed', 'joined_with_pay_window', 'pending_pay_confirmation_from_driver')
            `, [carId]);

            for (const row of activeBookingsRes.rows) {
                await createNotification({
                    client,
                    type: 'vehicle_updated',
                    titleKey: 'notifications.types.vehicle_updated_definite.title',
                    messageKey: 'notifications.types.vehicle_updated_definite.message',
                    userId: row.rider,
                    openLink: `/rides/${row.trip}`,
                    entityType: 'trips',
                    entityId: row.trip,
                    role: 'rider'
                });
            }
        }

        return NextResponse.json({ car: res.rows[0] });
    } catch (error: any) {
        console.error("Update Car API Error:", error);
        const t = await getTranslationForUser(null, client);
        return NextResponse.json({ error: t('api.errors.internalError') }, { status: 500 });
    } finally {
        client.release();
    }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ carId: string }> }) {
    const { carId } = await params;
    const client = await pool.connect();
    try {
        const user = await verifyUserFromRequest(
            req.headers.get('authorization') ?? undefined
        );

        if (!user || !user.uid) {
            const t = await getTranslationForUser(null, client);
            return NextResponse.json({ error: t('api.errors.unauthorized') }, { status: 401 });
        }

        const t = await getTranslationForUser(user.uid, client);

        // Soft delete
        const res = await client.query(
            `UPDATE cars SET deleted = true, deleted_at = NOW() WHERE id = $1 AND owner = $2`,
            [carId, user.uid]
        );

        if ((res.rowCount || 0) > 0) {
            // Unlink from trip templates
            await client.query(
                `UPDATE trip_templates SET car = NULL WHERE car = $1 AND driver = $2`,
                [carId, user.uid]
            );
        }

        if ((res.rowCount || 0) === 0) {
            return NextResponse.json({ error: t('api.errors.carNotFoundExact') }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error(error);
        const t = await getTranslationForUser(null, client);
        return NextResponse.json({ error: t('api.errors.internalError') }, { status: 500 });
    } finally {
        client.release();
    }
}
