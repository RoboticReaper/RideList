'use client';

import { useState, useEffect } from 'react';
import { Modal, Button, Text, Group, Stack, ThemeIcon, List } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { IconBellRinging, IconDeviceMobile, IconShare, IconSquarePlus, IconDownload, IconBan } from '@tabler/icons-react';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { useNotifications } from '@/components/Notifications/NotificationContext';

export function PushPermissionModal() {
    const { t } = useTranslation('common');
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
                title={t('pwa.blockedTitle')}
                centered
                size="sm"
            >
                <Stack align="center" gap="md" py="xs">
                    <ThemeIcon size={64} radius="xl" variant="light" color="red">
                        <IconBan size={32} />
                    </ThemeIcon>

                    <Text ta="center">
                        {t('pwa.blockedMessage')}
                    </Text>

                    <Text ta="center" size="sm" c="dimmed">
                        {t('pwa.blockedGuide')}
                    </Text>

                    <Button variant="default" fullWidth onClick={closePrompt}>
                        {t('pwa.fixedBtn')}
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
                title={t('pwa.installRequiredTitle')}
                centered
                size="sm"
            >
                <Stack align="center" gap="md" py="xs">
                    <ThemeIcon size={64} radius="xl" variant="light" color="blue">
                        <IconDeviceMobile size={32} />
                    </ThemeIcon>

                    <Text ta="center" fw={500}>
                        {t('pwa.installRequiredMessage')}
                    </Text>

                    <List type="ordered" spacing="sm" size="sm" center>
                        <List.Item icon={<IconShare size={16} />}>{t('pwa.installGuideIOS1')}</List.Item>
                        <List.Item icon={<IconSquarePlus size={16} />}>{t('pwa.installGuideIOS2')}</List.Item>
                    </List>

                    <Button variant="default" fullWidth onClick={closePrompt}>
                        {t('pwa.laterBtn')}
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
                title={t('pwa.installTitle')}
                centered
                size="sm"
            >
                <Stack align="center" gap="md" py="xs">
                    <ThemeIcon size={64} radius="xl" variant="light" color="green">
                        <IconDownload size={32} />
                    </ThemeIcon>

                    <Text ta="center">
                        {t('pwa.installMessage')}
                    </Text>

                    {!activePrompt && (
                        <Text ta="center" size="sm" c="dimmed">
                            {t('pwa.installGuideAndroid')}
                        </Text>
                    )}

                    <Group w="100%" grow>
                        <Button variant="default" onClick={closePrompt}>
                            {activePrompt ? t('pwa.notNowBtn') : t('pwa.closeBtn')}
                        </Button>
                        {activePrompt && (
                            <Button onClick={handleAndroidInstall} leftSection={<IconDownload size={16} />}>
                                {t('pwa.installBtn')}
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
            title={t('pwa.getUpdatesTitle')}
            centered
            size="sm"
        >
            <Stack align="center" gap="md" py="xs">
                <ThemeIcon size={64} radius="xl" variant="light" color="blue">
                    <IconBellRinging size={32} />
                </ThemeIcon>

                <Text ta="center">
                    {t('pwa.getUpdatesMessage')}
                </Text>

                <Group w="100%" grow>
                    <Button variant="default" onClick={closePrompt}>
                        {t('pwa.notNowBtn')}
                    </Button>
                    <Button onClick={handleEnable}>
                        {t('pwa.enableBtn')}
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
}
