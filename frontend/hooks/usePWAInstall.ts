import { useState, useEffect } from 'react';

interface PWAInstallStatus {
    isIOS: boolean;
    isAndroid: boolean;
    isStandalone: boolean;
    canInstall: boolean;
    activePrompt: any; // BeforeInstallPromptEvent
}

export function usePWAInstall(): PWAInstallStatus {
    const [status, setStatus] = useState<PWAInstallStatus>({
        isIOS: false,
        isAndroid: false,
        isStandalone: false,
        canInstall: false,
        activePrompt: null
    });

    useEffect(() => {
        // Detect Platform
        const ua = window.navigator.userAgent;
        const isIOS = /iPhone|iPad|iPod/.test(ua) || window.navigator.maxTouchPoints > 1;
        const isAndroid = /Android/.test(ua);

        // Detect Standalone (PWA) Mode
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
            (window.navigator as any).standalone === true;

        setStatus(prev => ({
            ...prev,
            isIOS,
            isAndroid,
            isStandalone
        }));

        // Detect Installability (Android mainly)
        const handleBeforeInstallPrompt = (e: any) => {
            e.preventDefault(); // Prevent mini-infobar
            setStatus(prev => ({
                ...prev,
                canInstall: true,
                activePrompt: e
            }));
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        };
    }, []);

    return status;
}
