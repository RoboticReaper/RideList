'use client';

import { useState, useEffect } from 'react';
import { Modal, Button, Text, Group, Stack, ThemeIcon, List } from '@mantine/core';
import { IconBellRinging, IconDeviceMobile, IconShare, IconSquarePlus, IconDownload, IconBan } from '@tabler/icons-react';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { useNotifications } from '@/components/Notifications/NotificationContext';

export function PushPermissionModal() {
    const { isModalOpen, closePrompt, showPrompt, requestPermission, pushPermission } = useNotifications();
    const { isIOS, isAndroid, isStandalone, activePrompt } = usePWAInstall();

    // State to track if we are in the "Post-Permission Install Upsell" phase for Android
    const [showAndroidInstallUpsell, setShowAndroidInstallUpsell] = useState(false);

    // Auto-prompt on PWA First Launch
    useEffect(() => {
        if (isStandalone && pushPermission === 'default') {
            const hasShown = localStorage.getItem('pwa_onboarding_prompt_shown');
            if (!hasShown) {
                showPrompt();
                localStorage.setItem('pwa_onboarding_prompt_shown', 'true');
            }
        }
    }, [isStandalone, pushPermission, showPrompt]);

    const handleEnable = async () => {
        // Android Flow: Request Permission first
        if (isAndroid && !showAndroidInstallUpsell) {
            // Close the "Ask Permission" modal to show browser prompt
            closePrompt();

            await requestPermission();

            // Check result immediately after promise resolves
            if (Notification.permission === 'granted' && !isStandalone) {
                setShowAndroidInstallUpsell(true);
                showPrompt({ force: true });
            }
            return;
        }

        // Standard/Desktop flow
        await requestPermission();
        // Context handles closing the prompt, but we can call it explicitly to be safe or if we removed that from context
    };

    const handleAndroidInstall = async () => {
        if (activePrompt) {
            activePrompt.prompt();
            const { outcome } = await activePrompt.userChoice;
            if (outcome === 'accepted') {
                closePrompt();
            }
        } else {
            // Fallback if no prompt available? Just close.
            closePrompt();
        }
    };

    // Reset upsell state when modal closes
    useEffect(() => {
        if (!isModalOpen) {
            // Small delay to prevent flickering if we are just switching states?
            // Actually, if we close, we reset.
            const t = setTimeout(() => setShowAndroidInstallUpsell(false), 300);
            return () => clearTimeout(t);
        }
    }, [isModalOpen]);



    // Denied State
    if (isModalOpen && pushPermission === 'denied') {
        return (
            <Modal
                opened={isModalOpen}
                onClose={closePrompt}
                title="Notifications Blocked"
                centered
                size="sm"
            >
                <Stack align="center" gap="md" py="xs">
                    <ThemeIcon size={64} radius="xl" variant="light" color="red">
                        <IconBan size={32} />
                    </ThemeIcon>

                    <Text ta="center">
                        Notifications are blocked by your browser settings.
                    </Text>

                    <Text ta="center" size="sm" c="dimmed">
                        Tap the lock icon 🔒 or info icon ⓘ in your address bar and reset permissions to receive updates.
                    </Text>

                    <Button variant="default" fullWidth onClick={closePrompt}>
                        I've Fixed It
                    </Button>
                </Stack>
            </Modal>
        );
    }

    // iOS Browser Flow (Blocker)
    // If open and on iOS and NOT standalone, we show instructions.
    if (isModalOpen && isIOS && !isStandalone) {
        return (
            <Modal
                opened={isModalOpen}
                onClose={closePrompt}
                title="Install App Required"
                centered
                size="sm"
            >
                <Stack align="center" gap="md" py="xs">
                    <ThemeIcon size={64} radius="xl" variant="light" color="blue">
                        <IconDeviceMobile size={32} />
                    </ThemeIcon>

                    <Text ta="center" fw={500}>
                        To reliably receive ride updates, please install the app to your home screen.
                    </Text>

                    <List type="ordered" spacing="sm" size="sm" center>
                        <List.Item icon={<IconShare size={16} />}>Tap the Share button in Safari</List.Item>
                        <List.Item icon={<IconSquarePlus size={16} />}>Scroll down and tap "Add to Home Screen"</List.Item>
                    </List>

                    <Button variant="default" fullWidth onClick={closePrompt}>
                        I'll do it later
                    </Button>
                </Stack>
            </Modal>
        );
    }

    // Android Install Upsell (Post-Grant or Standalone suggestion)
    // Show if explicit state is set OR if we are already granted but not installed (and on Android)
    if (isModalOpen && (showAndroidInstallUpsell || (pushPermission === 'granted' && isAndroid && !isStandalone))) {
        return (
            <Modal
                opened={isModalOpen}
                onClose={closePrompt}
                title="Install App"
                centered
                size="sm"
            >
                <Stack align="center" gap="md" py="xs">
                    <ThemeIcon size={64} radius="xl" variant="light" color="green">
                        <IconDownload size={32} />
                    </ThemeIcon>

                    <Text ta="center">
                        Notifications enabled! Install the app for a better experience.
                    </Text>

                    {!activePrompt && (
                        <Text ta="center" size="sm" c="dimmed">
                            To install, tap the browser menu (⋮) and select "Install App" or "Add to Home Screen".
                        </Text>
                    )}

                    <Group w="100%" grow>
                        <Button variant="default" onClick={closePrompt}>
                            {activePrompt ? 'Not Now' : 'Close'}
                        </Button>
                        {activePrompt && (
                            <Button onClick={handleAndroidInstall} leftSection={<IconDownload size={16} />}>
                                Install App
                            </Button>
                        )}
                    </Group>
                </Stack>
            </Modal>
        );
    }

    // Standard Permission Request
    return (
        <Modal
            opened={isModalOpen}
            onClose={closePrompt}
            title="Get Updates"
            centered
            size="sm"
        >
            <Stack align="center" gap="md" py="xs">
                <ThemeIcon size={64} radius="xl" variant="light" color="blue">
                    <IconBellRinging size={32} />
                </ThemeIcon>

                <Text ta="center">
                    Would you like to be notified about updates to this ride?
                </Text>

                <Group w="100%" grow>
                    <Button variant="default" onClick={closePrompt}>
                        Not Now
                    </Button>
                    <Button onClick={handleEnable}>
                        Enable Notifications
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
}
