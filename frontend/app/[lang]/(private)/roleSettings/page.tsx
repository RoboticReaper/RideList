'use client';

import { useDashboard } from '@/app/[lang]/(private)/DashboardContext';
import { useAuth } from '@/components/firebase/AuthContext';
import { useState, useEffect } from 'react';
import { Container, Title, Paper, Text, Stack, Switch, Button, Group, LoadingOverlay, Anchor } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCheck, IconX, IconDeviceMobile, IconDownload } from '@tabler/icons-react';
import { LocalizedLink } from '@/components/LocalizedLink';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { useNotifications } from '@/components/Notifications/NotificationContext';

const DRIVER_NOTIFICATIONS = [
    { key: 'trip_full', label: 'Trip Full', description: 'Get notified when your trip has been fully booked.' },
    { key: 'pay_timeout', label: 'Payment Timeout', description: 'Get notified when a rider fails to pay within the time limit.' }
];

const RIDER_NOTIFICATIONS = [
    { key: 'trip_updated', label: 'Trip Updates', description: 'Get notified when the driver updates trip details.' },
    { key: 'trip_completed', label: 'Trip Completed', description: 'Get notified when your trip is marked as completed.' }
];

import { Badge, ThemeIcon } from '@mantine/core';
import { IconBell, IconBellOff, IconBellRinging } from '@tabler/icons-react';

export default function RoleSettingsPage() {
    const { role, setRole } = useDashboard();
    const { user } = useAuth();
    const { pushPermission, showPrompt } = useNotifications();
    const { isIOS, isAndroid, isStandalone } = usePWAInstall();

    const PushStatusBadge = () => {
        if (pushPermission === 'granted') return <Badge color="green">Enabled</Badge>;
        if (pushPermission === 'denied') return <Badge color="red">Blocked</Badge>;
        return <Badge color="yellow">{isIOS && !isStandalone ? 'Install Required' : 'Not Enabled'}</Badge>;
    };

    const PushEnableButton = () => {
        // iOS Browser: Must Install First
        if (isIOS && !isStandalone) {
            return <Button size="xs" onClick={() => showPrompt()} leftSection={<IconDeviceMobile size={16} />}>Install App</Button>;
        }

        // Android: If Granted but not installed, suggest install
        if (isAndroid && !isStandalone && pushPermission === 'granted') {
            return <Button size="xs" onClick={() => showPrompt()} leftSection={<IconDownload size={16} />}>Install App</Button>;
        }

        if (pushPermission === 'granted') return <ThemeIcon color="green" variant="light"><IconCheck size={20} /></ThemeIcon>;

        if (pushPermission === 'denied') {
            return <Button size="xs" color="red" variant="subtle" onClick={() => alert('Please unblock notifications in your browser settings.')}>Fix in Browser</Button>;
        }

        return <Button size="xs" onClick={() => showPrompt()} leftSection={<IconBell size={16} />}>Enable Push</Button>;
    };

    const getPushDescription = () => {
        if (isIOS && !isStandalone) return "Install to home screen to enable notifications.";
        if (pushPermission === 'granted') {
            if (isAndroid && !isStandalone) return "Notifications enabled. Install app for better experience.";
            return "You are all set to receive push notifications.";
        }
        if (pushPermission === 'denied') return "You have blocked notifications. You must enable them in your browser settings.";
        return "Enable notifications to stay updated.";
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
                        title: 'Error',
                        message: 'Failed to fetch settings',
                        color: 'red',
                        icon: <IconX size={16} />
                    });
                }
            } catch (err) {
                console.error("Failed to fetch settings", err);
                notifications.show({
                    title: 'Error',
                    message: 'An error occurred while fetching settings',
                    color: 'red',
                    icon: <IconX size={16} />
                });
            } finally {
                setLoading(false);
            }
        };

        fetchSettings();
    }, [user, role]);

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
                    title: 'Success',
                    message: 'Settings saved successfully',
                    color: 'green',
                    icon: <IconCheck size={16} />
                });
            } else {
                notifications.show({
                    title: 'Error',
                    message: 'Failed to save settings',
                    color: 'red',
                    icon: <IconX size={16} />
                });
            }
        } catch (err) {
            console.error(err);
            notifications.show({
                title: 'Error',
                message: 'An error occurred while saving',
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
                <Title order={2} style={{ textTransform: 'capitalize' }}>{role} Settings</Title>

                <Text size="sm" c="dimmed">
                    Want to configure the other role? <Anchor component="button" onClick={() => setRole(role === 'driver' ? 'rider' : 'driver')}>Switch to {role === 'driver' ? 'Rider' : 'Driver'} Settings</Anchor> or <Anchor component={LocalizedLink} href="/settings">Go to Account Settings</Anchor>
                </Text>

                <Paper withBorder p="md" radius="md">
                    <Stack gap="md">
                        <div>
                            <Title order={4}>Push Notifications</Title>
                            <Text c="dimmed" size="sm">
                                Receive real-time updates for trips and bookings.
                            </Text>
                        </div>
                        <Group justify="space-between">
                            <div>
                                <Group gap="xs">
                                    <Text fw={500}>Status:</Text>
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
                            <Title order={4}>Notification Preferences</Title>
                            <Text c="dimmed" size="sm">
                                Manage which optional notifications you want to receive.
                                Critical alerts cannot be disabled.
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
                        Save Settings
                    </Button>
                </Group>
            </Stack>
        </Container>
    );
}
