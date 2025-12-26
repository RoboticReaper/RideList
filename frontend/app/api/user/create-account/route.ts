import { NextResponse } from 'next/server';
import { pool } from '@/app/api/lib/db'
import { verifyUserFromRequest } from '@/app/api/lib/verifyUser';

export async function POST(req: Request) {
    try {
        const user = await verifyUserFromRequest(
            req.headers.get('authorization') ?? undefined
        );

        const insertPromise = pool.query(
            'INSERT INTO users (id, email, created_at, last_active) VALUES ($1, $2, NOW(), NOW()) ON CONFLICT (id) DO NOTHING',
            [user.uid, user.email]
        );

        await insertPromise;

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error("Create account error:", error);
        return NextResponse.json({ success: false, error: 'Failed to create account' }, { status: 500 });
    }
}
