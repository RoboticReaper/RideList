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
    // Basic check to see if we're in a browser and have SW support
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
        return;
    }

    try {
        const messaging = getMessaging(app);
        await deleteToken(messaging);
    } catch (err: any) {
        // If the service worker failed to register (e.g. quick logout/timeout), 
        // we can probably ignore it as the token won't be usable anyway or doesn't exist.
        if (err?.code === 'messaging/failed-service-worker-registration') {
            console.debug('FCM token deletion skipped: Service worker not registered.');
            return;
        }
        console.error('Failed to delete FCM token', err);
    }
};
