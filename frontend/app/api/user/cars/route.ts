import { NextResponse } from 'next/server';
import { pool } from '@/app/api/lib/db';
import { verifyUserFromRequest } from '@/app/api/lib/verifyUser';
import { processCarImage } from '@/app/api/lib/processCarImage';

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
            `SELECT id, make, model, color, year, plate, seats, big_luggage, small_luggage, pic1, pic2, pic3, pic4 
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
        const { make, model, color, year, plate, seats, big_luggage, small_luggage, pic1, pic2, pic3, pic4 } = body;

        // Process car images (base64 → upload)
        const picUrls: (string | null)[] = [];
        for (const picData of [pic1, pic2, pic3, pic4]) {
            if (picData && typeof picData === 'string' && picData.startsWith('data:')) {
                picUrls.push(await processCarImage(picData, user.uid));
            } else if (picData && typeof picData === 'string' && picData.startsWith('https://')) {
                picUrls.push(picData);
            } else {
                picUrls.push(null);
            }
        }

        const res = await client.query(
            `INSERT INTO cars (owner, make, model, color, year, plate, seats, big_luggage, small_luggage, pic1, pic2, pic3, pic4, deleted)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, false)
             RETURNING *`,
            [user.uid, make, model, color, year, plate, seats, big_luggage, small_luggage, picUrls[0], picUrls[1], picUrls[2], picUrls[3]]
        );

        return NextResponse.json({ car: res.rows[0] });
    } catch (error: any) {
        console.error("Create Car API Error:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    } finally {
        client.release();
    }
}
