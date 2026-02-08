'use client';

import { Paper, Group, Avatar, Text, Stack, UnstyledButton, Badge } from '@mantine/core';
import { IconMessage, IconMessageCircleQuestion, IconChevronRight } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import dayjs from '@/utils/dateUtils';

interface Message {
    id: string;
    content: string;
    sender_id: string;
    receiver_id: string | null;
    message_type: string;
    parent_message_id: string | null;
    created_at: string;
}

export interface Thread {
    type: 'dm' | 'question';
    id: string; // For 'dm' it's the rider_id, for 'question' it's the question message id
    label: string;
    preview: string;
    timestamp: string;
    parentMessageId?: string; // For questions, this is the question's id
}

interface ThreadListViewProps {
    riderName: string;
    riderPhotoUrl: string | null;
    threads: Thread[];
    onSelectThread: (thread: Thread) => void;
    onBack: () => void;
}

export function ThreadListView({ riderName, riderPhotoUrl, threads, onSelectThread, onBack }: ThreadListViewProps) {
    const { t } = useTranslation('common');

    const dmThread = threads.find(th => th.type === 'dm');
    const questionThreads = threads.filter(th => th.type === 'question');

    return (
        <Stack h="100%" gap={0} bg="gray.0" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 }}>
            {/* Header */}
            <Paper p="md" shadow="xs" radius={0} withBorder>
                <Group gap="sm">
                    <UnstyledButton onClick={onBack}>
                        <Text c="blue" size="sm">← {t('tripDetails.chat.back') || 'Back'}</Text>
                    </UnstyledButton>
                    <Avatar src={riderPhotoUrl} radius="xl" size="sm" color="initials">
                        {riderName?.charAt(0)}
                    </Avatar>
                    <Text fw={600} size="lg">{riderName}</Text>
                </Group>
            </Paper>

            <Stack gap={0} p="md">
                <Text size="xs" c="dimmed" tt="uppercase" fw={600} mb="xs">
                    {t('tripDetails.chat.threads') || 'Conversations'}
                </Text>

                {/* DM Thread - Always at top */}
                {dmThread && (
                    <UnstyledButton
                        onClick={() => onSelectThread(dmThread)}
                        style={{ borderBottom: '1px solid var(--mantine-color-gray-2)' }}
                    >
                        <Paper p="md" bg="transparent">
                            <Group wrap="nowrap" align="center">
                                <IconMessage size={20} color="var(--mantine-color-blue-6)" />
                                <Stack gap={2} style={{ flex: 1 }}>
                                    <Group gap="xs">
                                        <Text fw={500} size="sm">{t('tripDetails.chat.directMessages') || 'Direct Messages'}</Text>
                                        <Badge size="xs" variant="light" color="blue">DM</Badge>
                                    </Group>
                                    <Text size="xs" c="dimmed" lineClamp={1}>{dmThread.preview || t('tripDetails.chat.noMessages')}</Text>
                                </Stack>
                                <IconChevronRight size={16} color="var(--mantine-color-gray-5)" />
                            </Group>
                        </Paper>
                    </UnstyledButton>
                )}

                {/* Question Threads */}
                {questionThreads.length > 0 && (
                    <>
                        <Text size="xs" c="dimmed" tt="uppercase" fw={600} mt="md" mb="xs">
                            {t('tripDetails.chat.questions') || 'Questions'}
                        </Text>
                        {questionThreads.map((qThread) => (
                            <UnstyledButton
                                key={qThread.id}
                                onClick={() => onSelectThread(qThread)}
                                style={{ borderBottom: '1px solid var(--mantine-color-gray-2)' }}
                            >
                                <Paper p="md" bg="transparent">
                                    <Group wrap="nowrap" align="center">
                                        <Avatar src={riderPhotoUrl} radius="xl" size="sm" color="initials">
                                            {riderName?.charAt(0)}
                                        </Avatar>
                                        <Stack gap={2} style={{ flex: 1 }}>
                                            <Text fw={500} size="sm" lineClamp={1}>{qThread.label}</Text>
                                            <Text size="xs" c="dimmed">
                                                {dayjs(qThread.timestamp).format('MMM D, h:mm A')}
                                            </Text>
                                        </Stack>
                                        <IconChevronRight size={16} color="var(--mantine-color-gray-5)" />
                                    </Group>
                                </Paper>
                            </UnstyledButton>
                        ))}
                    </>
                )}

                {/* Empty state */}
                {!dmThread && questionThreads.length === 0 && (
                    <Text c="dimmed" ta="center" mt="xl" size="sm">
                        {t('tripDetails.chat.noThreads') || 'No conversations yet'}
                    </Text>
                )}
            </Stack>
        </Stack>
    );
}

/**
 * Helper function to extract threads from messages for a given rider
 */
export function extractThreadsFromMessages(messages: Message[], riderId: string, driverId: string): Thread[] {
    const threads: Thread[] = [];

    // Find DMs (messages between driver and rider that are not questions/answers)
    const dmMessages = messages.filter(m =>
        (m.message_type === 'dm_private') &&
        (m.sender_id === riderId || m.receiver_id === riderId)
    );

    if (dmMessages.length > 0 || true) { // Always show DM thread
        // Get all DM messages including followups to first DM
        const firstDmId = dmMessages[0]?.id;
        const allDmMessages = firstDmId
            ? messages.filter(m =>
                m.message_type === 'dm_private' ||
                (m.message_type === 'followup' && m.parent_message_id === firstDmId)
            )
            : [];
        const lastDmMessage = allDmMessages[allDmMessages.length - 1];
        threads.push({
            type: 'dm',
            id: firstDmId || 'dm',
            label: 'Direct Messages',
            preview: lastDmMessage?.content || '',
            timestamp: lastDmMessage?.created_at || new Date().toISOString(),
            parentMessageId: firstDmId
        });
    }

    // Find parent-level questions from this rider
    const questions = messages.filter(m =>
        m.message_type === 'question' &&
        m.sender_id === riderId &&
        !m.parent_message_id // top-level questions only
    );

    questions.forEach(q => {
        // Find all messages in this question thread
        const threadMessages = messages.filter(m =>
            m.id === q.id ||
            m.parent_message_id === q.id
        );
        const lastMessage = threadMessages[threadMessages.length - 1];
        threads.push({
            type: 'question',
            id: q.id,
            label: q.content.substring(0, 50) + (q.content.length > 50 ? '...' : ''),
            preview: lastMessage?.content || q.content,
            timestamp: lastMessage?.created_at || q.created_at,
            parentMessageId: q.id
        });
    });

    return threads;
}
