'use client';

import { Container, Title, Paper, Group, Text, Avatar, Loader, Center, Stack, UnstyledButton, Badge } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/components/firebase/AuthContext';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import dayjs from '@/utils/dateUtils';
import { GlobalChatView } from './components/GlobalChatView';

interface DMThread {
    otherUserId: string;
    otherUserName: string;
    otherUserPhotoUrl: string | null;
    lastMessage: {
        id: string;
        content: string;
        type: string;
        createdAt: string;
    };
}

export default function MessagesContent() {
    const { t } = useTranslation('common');
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();
    const activeUserId = searchParams.get('userId');

    const [threads, setThreads] = useState<DMThread[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user || activeUserId) {
            setLoading(false);
            return;
        }

        const fetchThreads = async () => {
            try {
                const token = await user.getIdToken();
                const res = await fetch('/api/user/chat/threads', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setThreads(data.threads || []);
                }
            } catch (err) {
                console.error('Failed to fetch DM threads', err);
            } finally {
                setLoading(false);
            }
        };

        fetchThreads();
    }, [user, activeUserId]);

    if (authLoading || loading) {
        return (
            <Container size="md" py="xl">
                <Center h={200}><Loader /></Center>
            </Container>
        );
    }

    // If a specific conversation is selected, render the chat view
    if (activeUserId) {
        return <GlobalChatView otherUserId={activeUserId} onBack={() => router.back()} />;
    }

    return (
        <Container size="md" py="xl">
            <Title order={2} mb="xl">{t('metadata.messages.title')}</Title>

            {!user ? (
                <Paper withBorder p="xl" ta="center">
                    <Text>{t('rides.trends.loginPrompt')}</Text>
                </Paper>
            ) : threads.length === 0 ? (
                <Paper withBorder p="xl" ta="center">
                    <Text c="dimmed">No messages yet. Messages from ride requests will appear here.</Text>
                </Paper>
            ) : (
                <Stack gap="xs">
                    {threads.map(thread => (
                        <UnstyledButton
                            key={thread.otherUserId}
                            onClick={() => router.push(`?userId=${thread.otherUserId}`)}
                            style={(theme) => ({
                                display: 'block',
                                width: '100%'
                            })}
                        >
                            <Paper
                                withBorder
                                p="md"
                                radius="md"
                                style={(theme) => ({
                                    '&:hover': { backgroundColor: theme.colors.gray[0] }
                                })}
                            >
                                <Group wrap="nowrap" align="flex-start">
                                    <Avatar src={thread.otherUserPhotoUrl} radius="xl" size="md">
                                        {thread.otherUserName?.charAt(0)}
                                    </Avatar>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <Group justify="space-between" mb={4} wrap="nowrap">
                                            <Text fw={500} truncate>{thread.otherUserName}</Text>
                                            <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                                                {dayjs(thread.lastMessage.createdAt).fromNow()}
                                            </Text>
                                        </Group>
                                        <Text size="sm" c="dimmed" truncate>
                                            {thread.lastMessage.type === 'image'
                                                ? '🖼️ Image'
                                                : thread.lastMessage.content}
                                        </Text>
                                    </div>
                                </Group>
                            </Paper>
                        </UnstyledButton>
                    ))}
                </Stack>
            )}
        </Container>
    );
}
