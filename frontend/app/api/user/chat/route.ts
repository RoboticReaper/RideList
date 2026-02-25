import { NextResponse } from 'next/server';
import { pool } from '@/app/api/lib/db';
import { verifyUserFromRequest } from '@/app/api/lib/verifyUser';
import { getTranslationForUser, getTranslation } from '@/app/api/lib/i18n';
import { createNotification } from '@/app/api/lib/createNotification';
import { processChatImage } from '@/app/api/lib/processChatImage';

export async function GET(req: Request) {
    const client = await pool.connect();
    try {
        const user = await verifyUserFromRequest(req.headers.get('authorization') ?? undefined);
        if (!user || !user.uid) {
            const t = await getTranslation('en');
            return NextResponse.json({ error: t('api.errors.unauthorized') }, { status: 401 });
        }
        const userId = user.uid;

        const url = new URL(req.url);
        const otherUserId = url.searchParams.get('other_user_id');

        if (!otherUserId) {
            return NextResponse.json({ error: 'Missing other_user_id' }, { status: 400 });
        }

        const query = `
            SELECT 
                id, sender_id, receiver_id, message_type, content, parent_message_id, created_at, deleted
            FROM dm_messages
            WHERE ((sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1))
              AND deleted = false
            ORDER BY created_at ASC
        `;
        const res = await client.query(query, [userId, otherUserId]);

        return NextResponse.json({ messages: res.rows });
    } catch (error) {
        console.error('Error fetching DM messages:', error);
        const t = await getTranslation('en');
        return NextResponse.json({ error: t('api.errors.internalError') }, { status: 500 });
    } finally {
        client.release();
    }
}

export async function POST(req: Request) {
    const client = await pool.connect();
    try {
        const user = await verifyUserFromRequest(req.headers.get('authorization') ?? undefined);
        if (!user || !user.uid) {
            const t = await getTranslation('en');
            return NextResponse.json({ error: t('api.errors.unauthorized') }, { status: 401 });
        }
        const userId = user.uid;
        const t = await getTranslationForUser(userId, client);

        const body = await req.json();
        const { receiver_id, content, message_type, parent_message_id, context_trip_id, image_data } = body;

        if (!receiver_id) {
            return NextResponse.json({ error: t('api.errors.missingReceiver') || 'Missing receiver' }, { status: 400 });
        }

        let finalContent = content;
        let type = message_type || 'text';

        // Handle image upload
        if (image_data) {
            try {
                const imageUrl = await processChatImage(image_data, userId);
                finalContent = imageUrl;
                type = 'image';
            } catch (err) {
                console.error('Failed to process chat image:', err);
                return NextResponse.json({ error: 'Failed to process image' }, { status: 400 });
            }
        } else if (!content || !content.trim()) {
            return NextResponse.json({ error: t('api.errors.messageEmpty') }, { status: 400 });
        }

        const insertQuery = `
            INSERT INTO dm_messages (sender_id, receiver_id, message_type, content, parent_message_id)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `;
        const inserted = await client.query(insertQuery, [userId, receiver_id, type, finalContent, parent_message_id || null]);
        const insertedMessage = inserted.rows[0];

        // Send Notification if receiver differs from sender
        if (userId !== receiver_id) {
            const messagePreview = type === 'image' ? '📷 Image' : (finalContent.length > 50 ? finalContent.substring(0, 50) + '...' : finalContent);

            let openLink = '/dashboard';
            let notifyRole: 'rider' | 'driver' | 'global' = 'rider'; // Default

            if (context_trip_id) {
                // Determine roles based on context_trip_id if available to format openLink correctly
                const tripCheck = await client.query('SELECT driver FROM trips WHERE id = $1', [context_trip_id]);
                if ((tripCheck.rowCount || 0) > 0) {
                    const isDriver = tripCheck.rows[0].driver === userId;
                    if (isDriver) {
                        // Driver messaging rider: receiver is rider
                        openLink = `/dashboard/${context_trip_id}?tab=messages&chat_thread=dm`;
                        notifyRole = 'rider';
                    } else {
                        // Rider messaging driver: receiver is driver
                        openLink = `/dashboard/${context_trip_id}?tab=messages&chat_recipient=${userId}&chat_thread=dm`;
                        notifyRole = 'driver';
                    }
                }
            }

            await createNotification({
                client,
                type: 'messages',
                titleKey: 'notifications.messages.newMessage.title',
                messageKey: 'notifications.messages.newMessage.body',
                variables: { preview: messagePreview },
                userId: receiver_id,
                entityType: 'messages',
                entityId: insertedMessage.id,
                openLink: openLink,
                role: notifyRole
            });
        }

        return NextResponse.json(insertedMessage);
    } catch (error) {
        console.error('Error posting DM message:', error);
        const t = await getTranslation('en');
        return NextResponse.json({ error: t('api.errors.internalError') }, { status: 500 });
    } finally {
        client.release();
    }
}

export async function DELETE(req: Request) {
    const client = await pool.connect();
    try {
        const user = await verifyUserFromRequest(req.headers.get('authorization') ?? undefined);
        if (!user || !user.uid) {
            const t = await getTranslation('en');
            return NextResponse.json({ error: t('api.errors.unauthorized') }, { status: 401 });
        }
        const userId = user.uid;
        const t = await getTranslationForUser(userId, client);

        const url = new URL(req.url);
        const messageId = url.searchParams.get('message_id');

        if (!messageId) {
            return NextResponse.json({ error: 'Missing message ID' }, { status: 400 });
        }

        const messageRes = await client.query('SELECT sender_id, deleted FROM dm_messages WHERE id = $1', [messageId]);
        if (messageRes.rowCount === 0) {
            return NextResponse.json({ error: 'Message not found' }, { status: 404 });
        }

        const message = messageRes.rows[0];
        if (message.deleted) {
            return NextResponse.json({ error: 'Message already deleted' }, { status: 400 });
        }

        if (message.sender_id !== userId) {
            return NextResponse.json({ error: t('api.errors.cannotDeleteOthersMessage') || 'Cannot delete others message' }, { status: 403 });
        }

        await client.query('UPDATE dm_messages SET deleted = true WHERE id = $1', [messageId]);
        return NextResponse.json({ success: true, message_id: messageId });
    } catch (error) {
        console.error('Error deleting DM message:', error);
        const t = await getTranslation('en');
        return NextResponse.json({ error: t('api.errors.internalError') }, { status: 500 });
    } finally {
        client.release();
    }
}
