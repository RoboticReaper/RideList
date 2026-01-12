'use client';

import { useEffect } from 'react';
import { useNotifications } from './NotificationContext';

export function TitleNotificationUpdater() {
    const { unreadCount } = useNotifications();

    useEffect(() => {
        const updateTitle = () => {
            const titleElement = document.querySelector('title');
            if (!titleElement) return;

            let currentTitle = document.title;
            // Remove existing prefix if any to get the "clean" title
            const cleanTitle = currentTitle.replace(/^\(\d+\)\s/, '');

            if (unreadCount > 0) {
                const newTitle = `(${unreadCount}) ${cleanTitle}`;
                if (document.title !== newTitle) {
                    document.title = newTitle;
                }
            } else {
                if (document.title !== cleanTitle) {
                    document.title = cleanTitle;
                }
            }
        };

        // Run immediately when unreadCount changes
        updateTitle();

        // Observe document.head to catch if Next.js replaces the <title> tag entirely
        // or updates its content.
        const observer = new MutationObserver(() => {
            updateTitle();
        });

        observer.observe(document.head, { childList: true, subtree: true });

        return () => observer.disconnect();
    }, [unreadCount]);

    return null;
}
