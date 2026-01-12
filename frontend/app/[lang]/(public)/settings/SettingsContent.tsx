'use client';

import { useAuth } from '@/components/firebase/AuthContext';
import { useState, useEffect } from 'react';
import { Container, Title, Paper, Text, Stack, Button, Group, LoadingOverlay, Select, Anchor } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCheck, IconX } from '@tabler/icons-react';
import { LocalizedLink } from '@/components/LocalizedLink';
import { useTranslation, Trans } from 'react-i18next';

const LANGUAGE_OPTIONS = [
    { value: 'en', label: 'English' },
    { value: 'zh', label: '中文' }
];

export default function SettingsPage() {
    const { t } = useTranslation('common');
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
                        title: t('rides.errors.errorTitle'),
                        message: t('settings.notifications.fetchError'),
                        color: 'red',
                        icon: <IconX size={16} />
                    });
                }
            } catch (err) {
                console.error("Failed to fetch settings", err);
                notifications.show({
                    title: t('rides.errors.errorTitle'),
                    message: t('settings.notifications.fetchError'),
                    color: 'red',
                    icon: <IconX size={16} />
                });
            } finally {
                setLoading(false);
            }
        };

        fetchSettings();
    }, [user, t]);

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
                    title: t('rides.errors.successTitle'),
                    message: t('settings.notifications.saveSuccess'),
                    color: 'green',
                    icon: <IconCheck size={16} />
                });
            } else {
                notifications.show({
                    title: t('rides.errors.errorTitle'),
                    message: t('settings.notifications.saveError'),
                    color: 'red',
                    icon: <IconX size={16} />
                });
            }
        } catch (err) {
            console.error(err);
            notifications.show({
                title: t('rides.errors.errorTitle'),
                message: t('settings.notifications.saveError'),
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
                <Title order={2}>{t('settings.title')}</Title>

                <Text size="sm" c="dimmed">
                    {t('settings.roleLinkPre')} <Anchor component={LocalizedLink} href="/roleSettings">{t('settings.roleLink')}</Anchor>
                </Text>

                <Paper withBorder p="md" radius="md" pos="relative">
                    <LoadingOverlay visible={loading} overlayProps={{ radius: "sm", blur: 2 }} />
                    <Stack gap="md">
                        <div>
                            <Title order={4}>{t('settings.general')}</Title>
                            <Text c="dimmed" size="sm">
                                {t('settings.generalDesc')}
                            </Text>
                        </div>

                        <Select
                            label={t('settings.language')}
                            placeholder={t('settings.languagePlaceholder')}
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
                        {t('settings.save')}
                    </Button>
                </Group>
            </Stack>
        </Container>
    );
}
