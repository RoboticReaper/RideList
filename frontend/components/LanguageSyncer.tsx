'use client';

import { useEffect } from 'react';
import { useAuth } from './firebase/AuthContext';
import { usePathname, useRouter } from 'next/navigation';
import { languages, cookieName } from '@/app/i18n/settings';
import dayjs from '@/utils/dateUtils';
import 'dayjs/locale/zh';
import 'dayjs/locale/en';

export function LanguageSyncer() {
    const { user, loading } = useAuth();
    const pathname = usePathname();
    const router = useRouter();

    // Sync dayjs locale with current URL language
    useEffect(() => {
        const pathSegments = pathname.split('/');
        const currentLang = languages.includes(pathSegments[1]) ? pathSegments[1] : 'en';
        dayjs.locale(currentLang);
    }, [pathname]);

    useEffect(() => {
        const syncLanguage = async () => {
            if (!loading && user) {
                try {
                    const token = await user.getIdToken();
                    const res = await fetch('/api/account-settings', {
                        headers: {
                            'Authorization': `Bearer ${token}`
                        }
                    });
                    const data = await res.json();
                    const preferredLanguage = data.language; // 'en' or 'zh'

                    if (preferredLanguage) {
                        // Sync dayjs locale
                        dayjs.locale(preferredLanguage);

                        // Get current cookie value
                        const currentCookie = document.cookie
                            .split('; ')
                            .find(row => row.startsWith(`${cookieName}=`))
                            ?.split('=')[1];

                        // If cookie doesn't match preference, update it
                        if (currentCookie !== preferredLanguage && languages.includes(preferredLanguage)) {
                            // Set cookie
                            document.cookie = `${cookieName}=${preferredLanguage}; path=/; max-age=31536000; SameSite=Lax`;

                            // Check URL state
                            const pathSegments = pathname.split('/');
                            const currentLangPrefix = languages.includes(pathSegments[1]) ? pathSegments[1] : null;

                            if (currentLangPrefix) {
                                // If we have a language prefix (e.g. /zh/...), explicitly remove or replace it
                                // We prefer removing it to use the "clean" URL and let middleware handle it
                                const newPath = pathname.replace(`/${currentLangPrefix}`, '') || '/';
                                router.push(newPath);
                            } else {
                                // If no prefix (clean URL), just refresh to pick up the new cookie
                                router.refresh();
                            }
                        }
                    }
                } catch (err) {
                    console.error("Failed to sync language", err);
                }
            }
        };

        syncLanguage();
    }, [user, loading, pathname, router]);

    return null;
}
