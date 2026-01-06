
import { NextResponse } from 'next/server';
import { pool } from '@/app/api/lib/db';
import { verifyUserFromRequest } from '@/app/api/lib/verifyUser';

export async function GET(req: Request) {
    try {
        const user = await verifyUserFromRequest(
            req.headers.get('authorization') ?? undefined
        );

        const res = await pool.query('SELECT language FROM settings_global WHERE id = $1', [user.uid]);
        const language = res.rows[0]?.language || null;

        return NextResponse.json({ language });

    } catch (error) {
        console.error("Get Account Settings Error:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const user = await verifyUserFromRequest(
            req.headers.get('authorization') ?? undefined
        );

        const body = await req.json();
        const { language } = body;

        // language can be null if they unset it (though Select usually enforces options)
        // Let's allow update.

        const query = `
            INSERT INTO settings_global (id, language)
            VALUES ($1, $2)
            ON CONFLICT (id) DO UPDATE 
            SET language = $2
            RETURNING language
        `;

        const res = await pool.query(query, [user.uid, language]);

        return NextResponse.json({ language: res.rows[0].language });

    } catch (error) {
        console.error("Update Account Settings Error:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
