'use client';

import { useDashboard } from '@/app/[lang]/(private)/DashboardContext';
import { useAuth } from '@/components/firebase/AuthContext';
import { useState, useEffect } from 'react';
import { Container, Title, Paper, Text, Stack, Switch, Button, Group, LoadingOverlay, Anchor, Badge, ThemeIcon } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCheck, IconX, IconDeviceMobile, IconDownload, IconBell } from '@tabler/icons-react';
import { LocalizedLink } from '@/components/LocalizedLink';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { useNotifications } from '@/components/Notifications/NotificationContext';
import { useTranslation, Trans } from 'react-i18next';

export default function RoleSettingsPage() {
    const { t } = useTranslation('common');
    const { role, setRole } = useDashboard();
    const { user } = useAuth();
    const { pushPermission, showPrompt } = useNotifications();
    const { isIOS, isAndroid, isStandalone } = usePWAInstall();

    const DRIVER_NOTIFICATIONS = [
        { key: 'trip_full', label: t('roleSettings.preferences.tripFull'), description: t('roleSettings.preferences.tripFullDesc') },
        { key: 'pay_timeout', label: t('roleSettings.preferences.payTimeout'), description: t('roleSettings.preferences.payTimeoutDesc') }
    ];

    const RIDER_NOTIFICATIONS = [
        { key: 'trip_updated', label: t('roleSettings.preferences.tripUpdates'), description: t('roleSettings.preferences.tripUpdatesDesc') },
        { key: 'trip_completed', label: t('roleSettings.preferences.tripCompleted'), description: t('roleSettings.preferences.tripCompletedDesc') }
    ];

    const PushStatusBadge = () => {
        if (pushPermission === 'granted') return <Badge color="green">{t('roleSettings.push.enabled')}</Badge>;
        if (pushPermission === 'denied') return <Badge color="red">{t('roleSettings.push.blocked')}</Badge>;
        return <Badge color="yellow">{isIOS && !isStandalone ? t('roleSettings.push.installRequired') : t('roleSettings.push.notEnabled')}</Badge>;
    };

    const PushEnableButton = () => {
        // iOS Browser: Must Install First
        if (isIOS && !isStandalone) {
            return <Button size="xs" onClick={() => showPrompt({ force: true })} leftSection={<IconDeviceMobile size={16} />}>{t('roleSettings.push.installApp')}</Button>;
        }

        // Android: If Granted but not installed, suggest install
        if (isAndroid && !isStandalone && pushPermission === 'granted') {
            return <Button size="xs" onClick={() => showPrompt({ force: true })} leftSection={<IconDownload size={16} />}>{t('roleSettings.push.installApp')}</Button>;
        }

        if (pushPermission === 'granted') return <ThemeIcon color="green" variant="light"><IconCheck size={20} /></ThemeIcon>;

        if (pushPermission === 'denied') {
            return <Button size="xs" color="red" variant="subtle" onClick={() => alert(t('roleSettings.push.unblockBrowser'))}>{t('roleSettings.push.fixBrowser')}</Button>;
        }

        return <Button size="xs" onClick={() => showPrompt({ force: true })} leftSection={<IconBell size={16} />}>{t('roleSettings.push.enablePush')}</Button>;
    };

    const getPushDescription = () => {
        if (isIOS && !isStandalone) return t('roleSettings.push.iosInstall');
        if (pushPermission === 'granted') {
            if (isAndroid && !isStandalone) return t('roleSettings.push.androidInstall');
            return t('roleSettings.push.allSet');
        }
        if (pushPermission === 'denied') return t('roleSettings.push.blockedDesc');
        return t('roleSettings.push.enableDesc');
    };

    // Default to true for all to match consistent backend behavior if missing
    const [settings, setSettings] = useState<Record<string, boolean>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!user || !role) return;

        const fetchSettings = async () => {
            try {
                const token = await user.getIdToken();
                const res = await fetch(`/api/settings?role=${role}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (res.ok) {
                    const data = await res.json();
                    if (data.notifications) {
                        setSettings(data.notifications);
                    }
                } else {
                    console.error("Failed to fetch settings");
                    notifications.show({
                        title: t('rides.errors.errorTitle'),
                        message: t('roleSettings.notifications.fetchError'),
                        color: 'red',
                        icon: <IconX size={16} />
                    });
                }
            } catch (err) {
                console.error("Failed to fetch settings", err);
                notifications.show({
                    title: t('rides.errors.errorTitle'),
                    message: t('roleSettings.notifications.fetchError'),
                    color: 'red',
                    icon: <IconX size={16} />
                });
            } finally {
                setLoading(false);
            }
        };

        fetchSettings();
    }, [user, role, t]);

    const handleToggle = (key: string) => {
        setSettings(prev => ({
            ...prev,
            [key]: prev[key] === undefined ? false : !prev[key]
        }));
    };

    const handleSave = async () => {
        if (!user) return;
        setSaving(true);
        try {
            const token = await user.getIdToken();
            const res = await fetch('/api/settings', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    role,
                    notifications: settings
                })
            });

            if (res.ok) {
                notifications.show({
                    title: t('rides.errors.successTitle'),
                    message: t('roleSettings.notifications.saveSuccess'),
                    color: 'green',
                    icon: <IconCheck size={16} />
                });
            } else {
                notifications.show({
                    title: t('rides.errors.errorTitle'),
                    message: t('roleSettings.notifications.saveError'),
                    color: 'red',
                    icon: <IconX size={16} />
                });
            }
        } catch (err) {
            console.error(err);
            notifications.show({
                title: t('rides.errors.errorTitle'),
                message: t('roleSettings.notifications.saveError'),
                color: 'red',
                icon: <IconX size={16} />
            });
        } finally {
            setSaving(false);
        }
    };

    const notificationOptions = role === 'driver' ? DRIVER_NOTIFICATIONS : RIDER_NOTIFICATIONS;

    return (
        <Container size="sm" py="xl">
            <Stack gap="lg">
                <Title order={2} style={{ textTransform: 'capitalize' }}>{t('roleSettings.title', { role: t(`headerMenu.roles.${role}`) })}</Title>

                <Text size="sm" c="dimmed">
                    <Trans
                        i18nKey="roleSettings.switch"
                        values={{ role: role === 'driver' ? t('headerMenu.roles.rider') : t('headerMenu.roles.driver') }}
                        components={{
                            1: <Anchor component="button" onClick={() => setRole(role === 'driver' ? 'rider' : 'driver')} />,
                            2: <Anchor component={LocalizedLink} href="/settings" />
                        }}
                    />
                </Text>

                <Paper withBorder p="md" radius="md">
                    <Stack gap="md">
                        <div>
                            <Title order={4}>{t('roleSettings.push.title')}</Title>
                            <Text c="dimmed" size="sm">
                                {t('roleSettings.push.description')}
                            </Text>
                        </div>
                        <Group justify="space-between">
                            <div>
                                <Group gap="xs">
                                    <Text fw={500}>{t('roleSettings.push.status')}</Text>
                                    <PushStatusBadge />
                                </Group>
                                <Text size="xs" c="dimmed">
                                    {getPushDescription()}
                                </Text>
                            </div>
                            <PushEnableButton />
                        </Group>
                    </Stack>
                </Paper>

                <Paper withBorder p="md" radius="md" pos="relative">
                    <LoadingOverlay visible={loading} overlayProps={{ radius: "sm", blur: 2 }} />
                    <Stack gap="md">
                        <div>
                            <Title order={4}>{t('roleSettings.prefs.title')}</Title>
                            <Text c="dimmed" size="sm">
                                {t('roleSettings.prefs.description')}
                            </Text>
                        </div>

                        <Stack gap="sm">
                            {notificationOptions.map((option) => {
                                // If undefined, default to true (enabled by default)
                                const isEnabled = settings[option.key] !== false;

                                return (
                                    <Group key={option.key} justify="space-between" wrap="nowrap">
                                        <div>
                                            <Text fw={500}>{option.label}</Text>
                                            <Text size="xs" c="dimmed">{option.description}</Text>
                                        </div>
                                        <Switch
                                            size="md"
                                            checked={isEnabled}
                                            onChange={() => handleToggle(option.key)}
                                        />
                                    </Group>
                                );
                            })}
                        </Stack>
                    </Stack>
                </Paper>

                <Group justify="flex-end">
                    <Button
                        onClick={handleSave}
                        loading={saving}
                    >
                        {t('roleSettings.save')}
                    </Button>
                </Group>
            </Stack>
        </Container>
    );
}
