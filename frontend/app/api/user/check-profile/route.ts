import { NextResponse } from 'next/server';
import { pool } from '@/app/api/lib/db'
import { verifyUserFromRequest } from '@/app/api/lib/verifyUser';

export async function GET(req: Request) {
    try {
        const user = await verifyUserFromRequest(
            req.headers.get('authorization') ?? undefined
        );

        const checkPromise = pool.query(
            'SELECT 1 FROM profile_global WHERE id = $1',
            [user.uid]
        );

        const result = await checkPromise;
        const exists = (result.rowCount ?? 0) > 0;

        return NextResponse.json({ exists });

    } catch (error) {
        console.error("Check profile error:", error);
        return NextResponse.json({ exists: false }, { status: 401 });
    }
}
