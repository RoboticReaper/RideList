import { getMessaging, getToken, deleteToken } from 'firebase/messaging';
import { app } from '../components/firebase/firebase';
import { User } from 'firebase/auth';

const VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_KEY;

export const syncFcmToken = async (user: User, deviceId: string) => {
    if (!user) return;

    try {
        const messaging = getMessaging(app);
        const token = await getToken(messaging, {
            vapidKey: VAPID_KEY
        });

        if (!token) return;

        const idToken = await user.getIdToken();

        await fetch('/api/notifications/register-token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({ deviceId, token })
        });
    } catch (err) {
        console.error('FCM token sync failed', err);
    }
};

export const onMessageListener = () => {
    const messaging = getMessaging(app);
    return new Promise((resolve) => {
        // @ts-ignore
        if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
            import('firebase/messaging').then(({ onMessage }) => {
                onMessage(messaging, (payload) => {
                    resolve(payload);
                });
            });
        }
    });
};

export const deleteFcmToken = async () => {
    try {
        const messaging = getMessaging(app);
        await deleteToken(messaging);
    } catch (err) {
        console.error('Failed to delete FCM token', err);
    }
};
