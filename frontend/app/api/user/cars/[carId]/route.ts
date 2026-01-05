import { NextResponse } from 'next/server';
import { pool } from '@/app/api/lib/db';
import { verifyUserFromRequest } from '@/app/api/lib/verifyUser';

export async function GET(req: Request, { params }: { params: Promise<{ carId: string }> }) {
    const { carId } = await params;
    const client = await pool.connect();
    try {
        const user = await verifyUserFromRequest(
            req.headers.get('authorization') ?? undefined
        );

        if (!user || !user.uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const res = await client.query(
            `SELECT * FROM cars WHERE id = $1 AND owner = $2 AND deleted = false`,
            [carId, user.uid]
        );

        if (res.rowCount === 0) {
            return NextResponse.json({ error: 'Car not found' }, { status: 404 });
        }

        return NextResponse.json({ car: res.rows[0] });
    } catch (error: any) {
        console.error(error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
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

        if (!user || !user.uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json();
        const { make, model, color, year, plate, seats, big_luggage, small_luggage } = body;

        const res = await client.query(
            `UPDATE cars 
             SET make = $1, model = $2, color = $3, year = $4, plate = $5, seats = $6, big_luggage = $7, small_luggage = $8
             WHERE id = $9 AND owner = $10 AND deleted = false
             RETURNING *`,
            [make, model, color, year, plate, seats, big_luggage, small_luggage, carId, user.uid]
        );

        if (res.rowCount === 0) {
            return NextResponse.json({ error: 'Car not found' }, { status: 404 });
        }

        return NextResponse.json({ car: res.rows[0] });
    } catch (error: any) {
        console.error("Update Car API Error:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
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

        if (!user || !user.uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
            return NextResponse.json({ error: 'Car not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error(error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    } finally {
        client.release();
    }
}
