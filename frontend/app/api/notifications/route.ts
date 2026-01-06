import { NextRequest, NextResponse } from "next/server";
import { verifyUserFromRequest } from "../lib/verifyUser";
import { pool } from "../lib/db";

export async function GET(req: NextRequest) {
    const client = await pool.connect();
    try {
        const user = await verifyUserFromRequest(req.headers.get("Authorization") ?? undefined);

        if (!user || !user.uid) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const userId = user.uid;

        const searchParams = req.nextUrl.searchParams;
        const limit = parseInt(searchParams.get("limit") || "10", 10);
        const offset = parseInt(searchParams.get("offset") || "0", 10);

        const result = await client.query(
            `
            SELECT 
                id,
                type,
                title,
                body,
                entity_type,
                entity_id,
                open_link,
                read,
                created_at
            FROM notifications
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
            `,
            [userId, limit, offset]
        );

        return NextResponse.json(result.rows);

    } catch (error: any) {
        if (error.message === 'Missing or invalid Authorization header' || error.code?.startsWith('auth/')) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        console.error("Error fetching notifications:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    } finally {
        client.release();
    }
}

export async function PATCH(req: NextRequest) {
    const client = await pool.connect();
    try {
        const user = await verifyUserFromRequest(req.headers.get("Authorization") ?? undefined);

        if (!user || !user.uid) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const userId = user.uid;

        const body = await req.json();
        const notificationIds = body.notificationIds; // Expecting an array of strings

        if (!notificationIds || !Array.isArray(notificationIds) || notificationIds.length === 0) {
            return NextResponse.json({ error: "Invalid notificationIds" }, { status: 400 });
        }

        // Use ANY to match any id in the array and ensure it belongs to the user
        await client.query(
            `
            UPDATE notifications
            SET read = true
            WHERE id = ANY($1) AND user_id = $2
            `,
            [notificationIds, userId]
        );

        return NextResponse.json({ success: true });

    } catch (error: any) {
        if (error.message === 'Missing or invalid Authorization header' || error.code?.startsWith('auth/')) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        console.error("Error updating notifications:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    } finally {
        client.release();
    }
}
