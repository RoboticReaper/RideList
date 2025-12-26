import { NextResponse } from 'next/server';
import { pool } from '@/app/api/lib/db'
import { verifyUserFromRequest } from '@/app/api/lib/verifyUser';

export async function POST(req: Request) {
    try {
        const user = await verifyUserFromRequest(
            req.headers.get('authorization') ?? undefined
        );

        const body = await req.json();
        const { name, phone } = body;

        if (!name) {
            return NextResponse.json({ success: false, error: 'Name is required' }, { status: 400 });
        }

        const insertPromise = pool.query(
            `INSERT INTO profile_global (id, name, phone, verified, created_at) 
             VALUES ($1, $2, $3, false, NOW()) 
             ON CONFLICT (id) DO UPDATE SET name = $2, phone = $3`,
            [user.uid, name, phone || null]
        );

        await insertPromise;

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error("Create profile error:", error);
        return NextResponse.json({ success: false, error: 'Failed to create profile' }, { status: 500 });
    }
}
