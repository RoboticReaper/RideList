'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '../firebase/AuthContext';
import { syncFcmToken, onMessageListener, deleteFcmToken } from '../../lib/fcm';
import { useSearchParams, useRouter } from 'next/navigation';

export interface NotificationItem {
    id: string;
    type: string;
    title: string;
    body: string;
    entity_type?: string;
    entity_id?: string;
    open_link?: string;
    read: boolean;
    created_at: string;
}

interface NotificationContextType {
    // Data
    notifications: NotificationItem[];
    unreadCount: number;
    isLoading: boolean;
    hasMore: boolean;
    fetchMore: () => Promise<void>;
    markAsRead: (ids: string[]) => Promise<void>;
    markAllAsRead: () => Promise<void>;
    refresh: () => Promise<void>;

    // Push Permissions
    pushPermission: NotificationPermission;
    requestPermission: () => Promise<void>;
    showPrompt: (options?: { force?: boolean }) => void;
    closePrompt: () => void;
    dismissPrompt: () => void; // New method for user-initiated dismissal
    isModalOpen: boolean;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider = ({ children }: { children: React.ReactNode }) => {
    const { user } = useAuth();

    // --- Notification Data State ---
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const offsetRef = useRef(0);
    const LIMIT = 10;
    const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // --- Push Permission State ---
    const [pushPermission, setPushPermission] = useState<NotificationPermission>('default');
    const [isModalOpen, setIsModalOpen] = useState(false);

    const searchParams = useSearchParams();
    const router = useRouter();



    // 1. Device ID Helper
    const getDeviceId = useCallback(() => {
        if (typeof window === 'undefined') return '';
        let deviceId = localStorage.getItem('device_id');
        if (!deviceId) {
            deviceId = crypto.randomUUID();
            localStorage.setItem('device_id', deviceId);
        }
        return deviceId;
    }, []);

    // 2. Initialize Permission State
    useEffect(() => {
        if (typeof window !== 'undefined' && 'Notification' in window) {
            setPushPermission(Notification.permission);
        }
    }, []);

    // 3. Register Device & Sync Token (Moved from NotificationManager)
    useEffect(() => {
        let heartbeatInterval: NodeJS.Timeout;

        const initDevice = async () => {
            if (!user) return;

            try {
                const deviceId = getDeviceId();
                const idToken = await user.getIdToken();
                if (!idToken) return;

                // Register Device
                await fetch('/api/notifications/register-device', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${idToken}`
                    },
                    body: JSON.stringify({ deviceId })
                });

                // Sync if already granted
                const isSupported = typeof window !== 'undefined' && 'Notification' in window;
                if (isSupported && Notification.permission === 'granted') {
                    await syncFcmToken(user, deviceId);
                    setPushPermission('granted');
                }

                // Heartbeat (24h)
                heartbeatInterval = setInterval(() => {
                    // Re-check support inside interval just in case
                    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
                        syncFcmToken(user, deviceId);
                    }
                }, 24 * 60 * 60 * 1000);

            } catch (err: any) {
                // Item 3: Incognito / Private Mode handling
                if (err?.code === 'messaging/unsupported-browser' || err?.message?.includes('IndexedDB')) {
                    console.warn("FCM not supported (likely Incognito/Private mode). Notifications disabled.");
                    // We could set a state here to show a UI warning if desired
                } else {
                    console.error("Failed to init device registration", err);
                }
            }
        };


        const handleOnline = () => {
            initDevice();
        };

        if (user) {
            initDevice();
            window.addEventListener('online', handleOnline);

            // Also register Service Worker here
            if ('serviceWorker' in navigator) {
                // Wrap in try-catch for Incognito SW restrictions
                try {
                    navigator.serviceWorker.register('/firebase-messaging-sw.js?v=0.0.1');
                } catch (e) {
                    console.warn("Service Worker registration failed", e);
                }
            }
        } else {
            // Item 2: Logout Cleanup
            // When user is null (logged out), ensure we clean up the FCM token to prevent ghost notifications
            deleteFcmToken();
        }

        return () => {
            if (heartbeatInterval) clearInterval(heartbeatInterval);
            window.removeEventListener('online', handleOnline);
        };
    }, [user, getDeviceId]);

    // 3.5 Foreground Message Listener
    useEffect(() => {
        if (typeof window !== 'undefined' && 'serviceWorker' in navigator && pushPermission === 'granted') {
            onMessageListener().then((payload: any) => {
                if (payload) {
                    console.log("[NotificationContext] Foreground message received:", payload);
                    const newNotification: NotificationItem = {
                        id: payload.data?.id || crypto.randomUUID(),
                        type: payload.data?.type || 'general',
                        title: payload.notification?.title || 'New Notification',
                        body: payload.notification?.body || '',
                        entity_type: payload.data?.entity_type,
                        entity_id: payload.data?.entity_id,
                        open_link: payload.data?.open_link,
                        read: false,
                        created_at: new Date().toISOString()
                    };

                    setNotifications(prev => [newNotification, ...prev]);
                    setUnreadCount(prev => prev + 1);
                }
            });
        }
    }, [pushPermission]);



    // 4. Permission Logic
    const showPrompt = useCallback((options?: { force?: boolean }) => {
        const force = options?.force;

        // Check cooldown if not forced
        if (!force) {
            const lastDismissed = localStorage.getItem('push_prompt_dismissed_at');
            if (lastDismissed) {
                const daysSince = (Date.now() - parseInt(lastDismissed)) / (1000 * 60 * 60 * 24);
                if (daysSince < 7) return; // Still in cooldown
            }
        }

        // Safe check for Notification
        const currentPermission = (typeof window !== 'undefined' && 'Notification' in window)
            ? Notification.permission
            : 'default';

        if (currentPermission === 'granted' && !force) {
            // Already granted, just ensure sync
            if (user) syncFcmToken(user, getDeviceId());
            return;
        }

        if (currentPermission === 'denied' && !force) {
            return; // Don't annoy if denied unless forced (though modal logic usually handles 'denied' UI)
        }

        setIsModalOpen(true);
    }, [user, getDeviceId]);

    // 0. Check for iOS Install Param (Moved here to be after showPrompt declaration)
    useEffect(() => {
        if (searchParams?.get('pwa_ios_install') === 'true') {
            // Wait a tick for mount
            setTimeout(() => {
                showPrompt({ force: true });
                // Clean URL
                const newUrl = new URL(window.location.href);
                newUrl.searchParams.delete('pwa_ios_install');
                router.replace(newUrl.toString());
            }, 500);
        }
    }, [searchParams, showPrompt]);

    const closePrompt = useCallback(() => {
        setIsModalOpen(false);
    }, []);

    const dismissPrompt = useCallback(() => {
        setIsModalOpen(false);
        localStorage.setItem('push_prompt_dismissed_at', Date.now().toString());
    }, []);

    const requestPermission = useCallback(async () => {
        setIsModalOpen(false); // Close modal first

        const permission = await Notification.requestPermission();
        setPushPermission(permission);
        const deviceId = getDeviceId();

        if (user) {
            const idToken = await user.getIdToken();
            // Record result
            if (idToken) {
                await fetch('/api/notifications/prompt-result', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
                    body: JSON.stringify({ deviceId, result: permission === 'granted' ? 'accepted' : 'denied' })
                });
            }

            if (permission === 'granted') {
                await syncFcmToken(user, deviceId);
            }
        } else {
            // Record dismissal if needed, or if result was not granted
            if (permission !== 'granted') {
                localStorage.setItem('push_prompt_dismissed_at', Date.now().toString());
            }
        }
    }, [user, getDeviceId]);

    // --- Notification Data Fetching (Existing Logic) ---
    const fetchNotifications = useCallback(async (isRefresh = false) => {
        if (!user) return;

        try {
            const currentLimit = isRefresh ? Math.max(notifications.length, LIMIT) : LIMIT;
            const fetchOffset = isRefresh ? 0 : offsetRef.current;
            const fetchLimit = isRefresh ? currentLimit : LIMIT;

            if (!isRefresh) setIsLoading(true);

            const token = await user.getIdToken();
            const res = await fetch(`/api/notifications?limit=${fetchLimit}&offset=${fetchOffset}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                const data = await res.json();
                // data is { items: [], unreadCount: number }
                // OR fallback to array if older API version (though we just changed it)
                const items = Array.isArray(data) ? data : data.items;
                const backendUnreadCount = data.unreadCount !== undefined ? data.unreadCount : 0;

                // Update unread count only on refresh to sync true total
                if (isRefresh && data.unreadCount !== undefined) {
                    setUnreadCount(backendUnreadCount);
                }

                if (isRefresh) {
                    setNotifications(items);
                    offsetRef.current = items.length;
                    setHasMore(items.length >= fetchLimit);
                } else {
                    setNotifications(prev => {
                        const newIds = new Set(items.map((n: NotificationItem) => n.id));
                        const filteredPrev = prev.filter(n => !newIds.has(n.id));
                        return [...filteredPrev, ...items];
                    });
                    offsetRef.current += items.length;
                    setHasMore(items.length === LIMIT);
                }
            }
        } catch (error) {
            console.error("Failed to fetch notifications", error);
        } finally {
            if (!isRefresh) setIsLoading(false);
        }
    }, [user, notifications.length]);

    // Initial Data Load
    useEffect(() => {
        if (user) {
            fetchNotifications(true);
        } else {
            setNotifications([]);
        }
    }, [user]);

    // Polling Logic
    useEffect(() => {
        if (!user) return;
        const startPolling = (intervalMs: number) => {
            if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = setInterval(() => {
                fetchNotifications(true);
            }, intervalMs);
        };

        const handleVisibilityChange = () => {
            if (document.hidden) {
                startPolling(120000);
            } else {
                fetchNotifications(true); // Fetch immediately on focus
                startPolling(30000);
            }
        };

        startPolling(30000);
        document.addEventListener("visibilitychange", handleVisibilityChange);
        return () => {
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
        };
    }, [user, fetchNotifications]);

    const fetchMore = async () => {
        await fetchNotifications(false);
    };

    const markAsRead = async (ids: string[]) => {
        if (!user) return;
        try {
            const toMark = notifications.filter(n => ids.includes(n.id) && !n.read);
            if (toMark.length > 0) {
                setNotifications(prev => prev.map(n => ids.includes(n.id) ? { ...n, read: true } : n));
                setUnreadCount(prev => Math.max(0, prev - toMark.length));
            }
            const token = await user.getIdToken();
            await fetch('/api/notifications', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ notificationIds: ids })
            });
        } catch (error) {
            console.error("Failed to mark as read", error);
        }
    };

    const markAllAsRead = async () => {
        if (!user) return;
        try {
            // Optimistic update
            setNotifications(prev => prev.map(n => ({ ...n, read: true })));
            setUnreadCount(0);

            const token = await user.getIdToken();
            await fetch('/api/notifications', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ markAll: true })
            });
        } catch (error) {
            console.error("Failed to mark all as read", error);
            fetchNotifications(true);
        }
    };



    return (
        <NotificationContext.Provider value={{
            notifications,
            unreadCount,
            isLoading,
            hasMore,
            fetchMore,
            markAsRead,
            markAllAsRead,
            refresh: () => fetchNotifications(true),
            pushPermission,
            requestPermission,
            showPrompt,
            closePrompt,
            dismissPrompt,
            isModalOpen
        }}>
            {children}
        </NotificationContext.Provider>
    );
};

export const useNotifications = () => {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error("useNotifications must be used within a NotificationProvider");
    }
    return context;
};
