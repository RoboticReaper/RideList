
'use client';

import { useEffect } from 'react';
import { getMessaging, getToken } from 'firebase/messaging';
import { app } from './firebase/firebase'; // Adjust path if needed
import { useAuth } from './firebase/AuthContext';

const VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_KEY;

export const NotificationManager = () => {
    const { user } = useAuth();

    // 1. Generate / Retrieve Device ID
    const getDeviceId = () => {
        let deviceId = localStorage.getItem('device_id');
        if (!deviceId) {
            deviceId = crypto.randomUUID();
            localStorage.setItem('device_id', deviceId);
        }
        return deviceId;
    };

    // 2. Register Device on Auth Change
    useEffect(() => {
        const registerDevice = async () => {
            if (!user) return; // Only register if logged in

            try {
                const deviceId = getDeviceId();
                const idToken = await user.getIdToken();
                if (!idToken) return;

                await fetch('/api/notifications/register-device', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${idToken}`
                    },
                    body: JSON.stringify({ deviceId })
                });
            } catch (err) {
                console.error("Failed to register device", err);
            }
        };

        registerDevice();
    }, [user]);

    // 3. Expose Prompt Logic
    useEffect(() => {
        const handlePrompt = async () => {
            const deviceId = getDeviceId();

            // Check cooldown
            const lastDismissed = localStorage.getItem('push_prompt_dismissed_at');
            if (lastDismissed) {
                const daysSince = (Date.now() - parseInt(lastDismissed)) / (1000 * 60 * 60 * 24);
                if (daysSince < 7) {
                    return; // Cooldown active
                }
            }

            if (Notification.permission === 'denied') {
                return; // Never prompt if denied
            }

            if (Notification.permission === 'granted') {
                // Ensure token is synced
                if (user) requestToken(deviceId);
                return;
            }

            // Request Permission
            const permission = await Notification.requestPermission();

            if (!user) return; // Need user for API calls

            const idToken = await user.getIdToken();

            if (permission === 'granted') {
                requestToken(deviceId);
                // Record result
                if (idToken) {
                    await fetch('/api/notifications/prompt-result', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
                        body: JSON.stringify({ deviceId, result: 'accepted' })
                    });
                }

            } else if (permission === 'denied') {
                if (idToken) {
                    await fetch('/api/notifications/prompt-result', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
                        body: JSON.stringify({ deviceId, result: 'denied' })
                    });
                }
            } else {
                // Dimissed / default
                localStorage.setItem('push_prompt_dismissed_at', Date.now().toString());
                if (idToken) {
                    await fetch('/api/notifications/prompt-result', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
                        body: JSON.stringify({ deviceId, result: 'dismissed' })
                    });
                }
            }
        };

        window.addEventListener('trigger-push-prompt', handlePrompt);
        return () => window.removeEventListener('trigger-push-prompt', handlePrompt);
    }, [user]);

    const requestToken = async (deviceId: string) => {
        if (!user) return;
        try {
            const messaging = getMessaging(app);
            // VAPID key is vital for web push
            const currentToken = await getToken(messaging, {
                vapidKey: VAPID_KEY
            });

            if (currentToken) {
                const idToken = await user.getIdToken();
                if (idToken) {
                    await fetch('/api/notifications/register-token', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
                        body: JSON.stringify({ deviceId, token: currentToken })
                    });
                }
            }
        } catch (err) {
            console.error('An error occurred while retrieving token. ', err);
        }
    }

    useEffect(() => {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js')
                .then(reg => {
                    if (!reg) {
                        navigator.serviceWorker.register('/firebase-messaging-sw.js');
                    }
                });
        }
    }, []);


    return null; // Headless component
};

