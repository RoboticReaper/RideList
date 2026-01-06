'use client';

import { useEffect } from 'react';
import { useAuth } from './firebase/AuthContext';
import { usePathname, useRouter } from 'next/navigation';
import { languages } from '@/app/i18n/settings';

export function LanguageSyncer() {
    const { user, loading } = useAuth();
    const pathname = usePathname();
    const router = useRouter();

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
                        const currentLang = pathname.split('/')[1];

                        // Check if preferredLanguage is valid and different from current
                        if (currentLang !== preferredLanguage && languages.includes(preferredLanguage)) {
                            // Replace the language segment in the URL
                            // We assume the first segment is the language if it is in the supported languages list
                            let newPath = pathname;
                            if (languages.includes(currentLang)) {
                                newPath = pathname.replace(`/${currentLang}`, `/${preferredLanguage}`);
                            } else {
                                // If current path doesn't start with a supported language, prepend it
                                // (Logic similar to middleware or localized link handling)
                                newPath = `/${preferredLanguage}${pathname === '/' ? '' : pathname}`;
                            }
                            router.push(newPath);
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
