import { NextResponse } from 'next/server';
import { pool } from '@/app/api/lib/db';
import { verifyUserFromRequest } from '@/app/api/lib/verifyUser';

export async function GET(req: Request) {
    const client = await pool.connect();
    try {
        const user = await verifyUserFromRequest(
            req.headers.get('authorization') ?? undefined
        );

        if (!user || !user.uid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const res = await client.query(
            `SELECT id, make, model, color, year, plate, seats, big_luggage, small_luggage 
             FROM cars 
             WHERE owner = $1 AND deleted = false 
             ORDER BY last_selected DESC`,
            [user.uid]
        );

        return NextResponse.json({ cars: res.rows });
    } catch (error: any) {
        console.error("Get Cars API Error:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    } finally {
        client.release();
    }
}
export async function POST(req: Request) {
    const client = await pool.connect();
    try {
        const user = await verifyUserFromRequest(
            req.headers.get('authorization') ?? undefined
        );

        if (!user || !user.uid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { make, model, color, year, plate, seats, big_luggage, small_luggage } = body;



        const res = await client.query(
            `INSERT INTO cars (owner, make, model, color, year, plate, seats, big_luggage, small_luggage, deleted)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false)
             RETURNING *`,
            [user.uid, make, model, color, year, plate, seats, big_luggage, small_luggage]
        );

        return NextResponse.json({ car: res.rows[0] });
    } catch (error: any) {
        console.error("Create Car API Error:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    } finally {
        client.release();
    }
}
