
'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '../firebase/AuthContext';

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
    notifications: NotificationItem[];
    unreadCount: number;
    isLoading: boolean;
    hasMore: boolean;
    fetchMore: () => Promise<void>;
    markAsRead: (ids: string[]) => Promise<void>;
    refresh: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider = ({ children }: { children: React.ReactNode }) => {
    const { user } = useAuth();
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const offsetRef = useRef(0);
    const LIMIT = 10;

    // Polling interval ref to manage switching frequencies
    const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

    const fetchNotifications = useCallback(async (isRefresh = false) => {
        if (!user) return;

        try {
            // If refreshing (polling), we probably just want to fetch the latest X and merge/replace?
            // Actually, for polling, simpler to just re-fetch the first page or "since" a timestamp.
            // But spec says "load 10 by default". 
            // Let's keep it simple: Polling just re-fetches the *currently loaded range* or just the first page?
            // If user scrolled down and loaded 50 items, re-fetching all 50 might be heavy.
            // Simple approach: Polling just fetches the top 10. If new ones appear, they are added.
            // But if we just replace the list, scroll position might jump if we are not careful.

            // Let's assume polling refreshes the whole list currently viewed OR just adds new ones at top.
            // Use case: "Refetches notifications every 30 seconds"
            // To make it consistent, let's just re-fetch the first page (limit=offset so far?)
            // Actually, if I have 20 items loaded, and I poll, I should probably fetch the latest 20 again to check for 'read' status updates elsewhere?

            // Re-evaluating: "make this component so that it refetches notifications..."
            // Safest implementation: Just re-fetch everything we have currently loaded (limit = current length or default 10).

            if (isRefresh) {
                // When polling/refreshing in background, let's just fetch the *count* of what we have.
                // e.g. if we have 20 items, fetch 20.
                // NOTE: If creating this from scratch, just fetch Limit + Offset?
                // Let's stick to: Fetch (offset=0, limit=currentListLength || 10).
            }

            const currentLimit = isRefresh ? Math.max(notifications.length, LIMIT) : LIMIT;
            // If not refresh (load more), we use offset.
            // If refresh, we fetch from 0 to current count.

            const fetchOffset = isRefresh ? 0 : offsetRef.current;
            const fetchLimit = isRefresh ? currentLimit : LIMIT;

            // Wait, if I implement "Load More", I append.
            // If I implement "Poll", I should probably just replace the whole list to ensure consistency (read status etc).

            if (!isRefresh) setIsLoading(true);

            const token = await user.getIdToken();
            const res = await fetch(`/api/notifications?limit=${fetchLimit}&offset=${fetchOffset}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                const data = await res.json();

                if (isRefresh) {
                    setNotifications(data);
                    // If we refreshed, update offset to match data length?
                    // actually offset should track "how many we have loaded".
                    offsetRef.current = data.length;
                    // If we got fewer than requested, maybe no more?
                    setHasMore(data.length >= fetchLimit);
                } else {
                    // Append
                    setNotifications(prev => {
                        // filtering duplicates just in case?
                        const newIds = new Set(data.map((n: NotificationItem) => n.id));
                        const filteredPrev = prev.filter(n => !newIds.has(n.id));
                        return [...filteredPrev, ...data];
                    });
                    offsetRef.current += data.length;
                    setHasMore(data.length === LIMIT);
                }
            }
        } catch (error) {
            console.error("Failed to fetch notifications", error);
        } finally {
            if (!isRefresh) setIsLoading(false);
        }
    }, [user, notifications.length]);

    // Initial load
    useEffect(() => {
        if (user) {
            fetchNotifications(true); // Treat initial as a refresh/reset
        } else {
            setNotifications([]);
        }
    }, [user]);

    // Polling logic
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
                // Background: 2 minutes
                startPolling(120000);
            } else {
                // Foreground: 30 seconds
                startPolling(30000);
            }
        };

        // Start initial (foreground assumed)
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
            // Optimistic update
            setNotifications(prev => prev.map(n => ids.includes(n.id) ? { ...n, read: true } : n));

            const token = await user.getIdToken();
            await fetch('/api/notifications', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ notificationIds: ids })
            });
        } catch (error) {
            console.error("Failed to mark as read", error);
            // Revert changes? (Skipping for now as fetch will correct it eventually)
        }
    };

    const unreadCount = notifications.filter(n => !n.read).length;

    return (
        <NotificationContext.Provider value={{
            notifications,
            unreadCount,
            isLoading,
            hasMore,
            fetchMore,
            markAsRead,
            refresh: () => fetchNotifications(true)
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
