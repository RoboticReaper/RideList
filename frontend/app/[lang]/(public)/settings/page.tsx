'use client';

import { useAuth } from '@/components/firebase/AuthContext';
import { useState, useEffect } from 'react';
import { Container, Title, Paper, Text, Stack, Button, Group, LoadingOverlay, Select, Anchor } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCheck, IconX } from '@tabler/icons-react';
import { LocalizedLink } from '@/components/LocalizedLink';

const LANGUAGE_OPTIONS = [
    { value: 'en', label: 'English' },
    { value: 'zh', label: '中文' }
];

export default function SettingsPage() {
    const { user } = useAuth();
    const [language, setLanguage] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!user) return;

        const fetchSettings = async () => {
            try {
                const token = await user.getIdToken();
                const res = await fetch('/api/account-settings', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (res.ok) {
                    const data = await res.json();
                    if (data.language) {
                        setLanguage(data.language);
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
    }, [user]);

    const handleSave = async () => {
        if (!user) return;
        setSaving(true);
        try {
            const token = await user.getIdToken();
            const res = await fetch('/api/account-settings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    language
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

    return (
        <Container size="sm" py="xl">
            <Stack gap="lg">
                <Title order={2}>Account Settings</Title>

                <Text size="sm" c="dimmed">
                    Want to configure role-specific settings? <Anchor component={LocalizedLink} href="/roleSettings">Go to Role Settings</Anchor>
                </Text>

                <Paper withBorder p="md" radius="md" pos="relative">
                    <LoadingOverlay visible={loading} overlayProps={{ radius: "sm", blur: 2 }} />
                    <Stack gap="md">
                        <div>
                            <Title order={4}>General Preferences</Title>
                            <Text c="dimmed" size="sm">
                                Manage your account-level preferences.
                            </Text>
                        </div>

                        <Select
                            label="Language"
                            placeholder="Select language"
                            data={LANGUAGE_OPTIONS}
                            value={language}
                            onChange={setLanguage}
                        />
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
