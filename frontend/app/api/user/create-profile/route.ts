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

        const isIllinoisUser = user.email?.endsWith('@illinois.edu') || false;

        const globalProfileRes = await pool.query(
            `INSERT INTO profile_global (id, name, phone, verified, created_at) 
             VALUES ($1, $2, $3, $4, NOW()) 
             ON CONFLICT (id) DO UPDATE SET name = $2, phone = $3, verified = $4`,
            [user.uid, name, phone || null, isIllinoisUser]
        );

        // Create empty role profiles
        await Promise.all([
            pool.query(
                `INSERT INTO profile_rider (id) VALUES ($1) ON CONFLICT DO NOTHING`,
                [user.uid]
            ),
            pool.query(
                `INSERT INTO profile_driver (id) VALUES ($1) ON CONFLICT DO NOTHING`,
                [user.uid]
            )
        ]);

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error("Create profile error:", error);
        return NextResponse.json({ success: false, error: 'Failed to create profile' }, { status: 500 });
    }
}
