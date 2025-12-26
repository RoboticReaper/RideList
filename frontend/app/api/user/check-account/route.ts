import { NextResponse } from 'next/server';
import { pool } from '@/app/api/lib/db'
import { verifyUserFromRequest } from '@/app/api/lib/verifyUser';

export async function GET(req: Request) {
    try {
        const user = await verifyUserFromRequest(
            req.headers.get('authorization') ?? undefined
        );

        const updatePromise = pool.query(
            'UPDATE users SET last_active = NOW() WHERE id = $1 RETURNING 1',
            [user.uid]
        );

        const result = await updatePromise;
        const exists = (result.rowCount ?? 0) > 0;

        return NextResponse.json({ exists });

    } catch (error) {
        console.error("Check account error:", error);
        return NextResponse.json({ exists: false }, { status: 401 });
    }
}
