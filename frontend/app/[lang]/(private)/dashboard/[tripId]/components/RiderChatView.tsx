'use client';

import { useState, useCallback, useEffect } from 'react';
import { Box, Loader, Alert, Paper, Textarea, Button, Group, Text, Stack, Modal, UnstyledButton, Badge, Avatar, ScrollArea } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconSpeakerphone, IconSend, IconMessage, IconMessageCircleQuestion, IconChevronRight, IconCheck, IconPlus, IconX } from '@tabler/icons-react';
import { ChatInterface } from './ChatInterface';
import { useAuth } from '@/components/firebase/AuthContext';
import { useTranslation } from 'react-i18next';
import dayjs from '@/utils/dateUtils';

interface RiderChatViewProps {
    tripId: string;
    driverName?: string;
    driverPhotoUrl?: string | null;
}

interface Thread {
    type: 'announcement' | 'dm' | 'question';
    id: string;
    label: string;
    preview: string;
    timestamp: string;
    parentMessageId?: string;
}

export function RiderChatView({ tripId, driverName, driverPhotoUrl }: RiderChatViewProps) {
    const { user } = useAuth();
    const { t } = useTranslation('common');
    const [activeThread, setActiveThread] = useState<Thread | null>(null);
    const [messages, setMessages] = useState<any[]>([]);
    const [threadMessages, setThreadMessages] = useState<any[]>([]);
    const [threads, setThreads] = useState<Thread[]>([]);
    const [loadingChat, setLoadingChat] = useState(true);
    const [sending, setSending] = useState(false);
    const [questionText, setQuestionText] = useState('');
    const [askingQuestion, setAskingQuestion] = useState(false);
    const [showAskModal, setShowAskModal] = useState(false);

    // Fetch all messages for this trip
    const fetchMessages = useCallback(async () => {
        if (!user) return;
        try {
            const token = await user.getIdToken();
            const res = await fetch(`/api/trips/${tripId}/chat`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error("Failed to load chat");
            const data = await res.json();

            const msgs = data.messages.map((m: any) => ({
                ...m,
                is_me: m.sender_id === user.uid
            }));

            setMessages(msgs);

            // Extract threads from messages
            const extractedThreads = extractRiderThreads(msgs, user.uid);
            setThreads(extractedThreads);
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingChat(false);
        }
    }, [user, tripId]);

    useEffect(() => {
        fetchMessages();
        const interval = setInterval(fetchMessages, 5000);
        return () => clearInterval(interval);
    }, [fetchMessages]);

    // Filter messages for selected thread
    useEffect(() => {
        if (!activeThread || !messages.length) {
            setThreadMessages([]);
            return;
        }

        if (activeThread.type === 'announcement') {
            // Show all announcements
            const announcementMsgs = messages.filter(m =>
                m.message_type === 'announcement' || m.message_type === 'answer_public'
            );
            setThreadMessages(announcementMsgs);
        } else if (activeThread.type === 'dm') {
            // Show DMs between rider and driver (includes dm_private and followups to the first DM)
            const dmParentId = activeThread.parentMessageId;
            const dmMsgs = messages.filter(m =>
                m.message_type === 'dm_private' ||
                (m.message_type === 'followup' && m.parent_message_id === dmParentId)
            );
            setThreadMessages(dmMsgs);
        } else if (activeThread.type === 'question') {
            // Show the question thread
            const questionId = activeThread.parentMessageId;
            const threadMsgs = messages.filter(m =>
                m.id === questionId ||
                m.parent_message_id === questionId
            );
            setThreadMessages(threadMsgs);
        }
    }, [activeThread, messages]);

    const sendMessage = async (content: string) => {
        if (!user) return;
        setSending(true);
        try {
            const token = await user.getIdToken();

            let payload: any;
            if (activeThread?.type === 'question') {
                // Followup to a question
                payload = {
                    content,
                    message_type: 'followup',
                    parent_message_id: activeThread.parentMessageId
                };
            } else if (activeThread?.type === 'dm') {
                // DM to driver (rider can reply to DM thread)
                payload = {
                    content,
                    message_type: 'followup',
                    parent_message_id: activeThread.parentMessageId
                };
                console.log(activeThread)
            } else {
                // Announcements are read-only
                return;
            }

            const res = await fetch(`/api/trips/${tripId}/chat`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const errorData = await res.json();
                notifications.show({
                    title: t('common.error' as any) || 'Error',
                    message: errorData.error || t('tripDetails.chat.sendFailed' as any) || 'Failed to send message',
                    color: 'red',
                    icon: <IconX size={16} />,
                    autoClose: 5000
                });
                return;
            }

            await fetchMessages();
        } catch (err) {
            console.error(err);
            notifications.show({
                title: t('common.error' as any) || 'Error',
                message: t('tripDetails.chat.sendFailed' as any) || 'Failed to send message',
                color: 'red',
                icon: <IconX size={16} />,
                autoClose: 5000
            });
        } finally {
            setSending(false);
        }
    };

    const askQuestion = async () => {
        if (!user || !questionText.trim()) return;
        setAskingQuestion(true);
        try {
            const token = await user.getIdToken();
            const payload = {
                content: questionText.trim(),
                message_type: 'question'
            };

            const res = await fetch(`/api/trips/${tripId}/chat`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                setQuestionText('');
                setShowAskModal(false);
                notifications.show({
                    title: t('tripDetails.chat.questionSent' as any) || 'Question Sent',
                    message: t('tripDetails.chat.questionSentDesc' as any) || 'Your question has been sent to the driver',
                    color: 'green',
                    icon: <IconCheck size={16} />,
                    autoClose: 3000
                });
                await fetchMessages();
            } else {
                const errorData = await res.json();
                notifications.show({
                    title: t('common.error' as any) || 'Error',
                    message: errorData.error || t('tripDetails.chat.sendFailed' as any) || 'Failed to send question',
                    color: 'red',
                    icon: <IconX size={16} />,
                    autoClose: 5000
                });
            }
        } catch (err) {
            console.error(err);
            notifications.show({
                title: t('common.error' as any) || 'Error',
                message: t('tripDetails.chat.sendFailed' as any) || 'Failed to send question',
                color: 'red',
                icon: <IconX size={16} />,
                autoClose: 5000
            });
        } finally {
            setAskingQuestion(false);
        }
    };

    if (loadingChat) return <Box p="xl" ta="center"><Loader /></Box>;

    // Thread view
    if (activeThread) {
        const canSend = activeThread.type === 'question' || activeThread.type === 'dm'; // Questions and DMs allow replies
        return (
            <Box style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 200, background: 'white' }}>
                <ChatInterface
                    messages={threadMessages}
                    onSend={canSend ? sendMessage : undefined}
                    recipientName={activeThread.type === 'announcement'
                        ? (t('tripDetails.chat.announcements' as any) || 'Announcements')
                        : (driverName || t('tripDetails.chat.driver' as any) || 'Driver')}
                    recipientPhotoUrl={activeThread.type === 'announcement' ? null : driverPhotoUrl}
                    onBack={() => setActiveThread(null)}
                    loading={false}
                    sending={sending}
                />
            </Box>
        );
    }

    // Thread list view
    const announcementThread = threads.find(th => th.type === 'announcement');
    const dmThread = threads.find(th => th.type === 'dm');
    const questionThreads = threads.filter(th => th.type === 'question');

    return (
        <Stack gap="md">
            {/* Ask Question Button */}
            <Button
                leftSection={<IconPlus size={16} />}
                onClick={() => setShowAskModal(true)}
                variant="light"
            >
                {t('tripDetails.chat.askQuestion' as any) || 'Ask a Question'}
            </Button>

            {/* Announcements Thread */}
            {announcementThread && (
                <UnstyledButton onClick={() => setActiveThread(announcementThread)} w="100%">
                    <Paper p="md" withBorder radius="md" bg="blue.0">
                        <Group wrap="nowrap" align="center">
                            <IconSpeakerphone size={24} color="var(--mantine-color-blue-6)" />
                            <Stack gap={2} style={{ flex: 1 }}>
                                <Group gap="xs">
                                    <Text fw={600}>{t('tripDetails.chat.announcements' as any) || 'Announcements'}</Text>
                                    <Badge size="xs" variant="light" color="blue">
                                        {messages.filter(m => m.message_type === 'announcement' || m.message_type === 'answer_public').length}
                                    </Badge>
                                </Group>
                                <Text size="xs" c="dimmed" lineClamp={1}>{announcementThread.preview}</Text>
                            </Stack>
                            <IconChevronRight size={16} color="var(--mantine-color-gray-5)" />
                        </Group>
                    </Paper>
                </UnstyledButton>
            )}

            {/* DM Thread */}
            {dmThread && (
                <UnstyledButton onClick={() => setActiveThread(dmThread)} w="100%">
                    <Paper p="md" withBorder radius="md">
                        <Group wrap="nowrap" align="center">
                            <Avatar src={driverPhotoUrl} radius="xl" size="md" color="initials">
                                {driverName?.charAt(0) || 'D'}
                            </Avatar>
                            <Stack gap={2} style={{ flex: 1 }}>
                                <Group gap="xs">
                                    <Text fw={600}>{t('tripDetails.chat.directMessages' as any) || 'Direct Messages'}</Text>
                                    <Badge size="xs" variant="light" color="gray">DM</Badge>
                                </Group>
                                <Text size="xs" c="dimmed" lineClamp={1}>{dmThread.preview || t('tripDetails.chat.noMessages' as any)}</Text>
                            </Stack>
                            <IconChevronRight size={16} color="var(--mantine-color-gray-5)" />
                        </Group>
                    </Paper>
                </UnstyledButton>
            )}

            {/* Question Threads */}
            {questionThreads.length > 0 && (
                <>
                    <Text size="sm" fw={600} c="dimmed" tt="uppercase" mt="sm">
                        {t('tripDetails.chat.yourQuestions' as any) || 'Your Questions'}
                    </Text>
                    {questionThreads.map((qThread) => (
                        <UnstyledButton key={qThread.id} onClick={() => setActiveThread(qThread)} w="100%">
                            <Paper p="md" withBorder radius="md">
                                <Group wrap="nowrap" align="center">
                                    <Avatar src={driverPhotoUrl} radius="xl" size="md" color="initials">
                                        {driverName?.charAt(0) || 'D'}
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
            {!announcementThread && !dmThread && questionThreads.length === 0 && (
                <Text c="dimmed" ta="center" py="xl">
                    {t('tripDetails.chat.noThreads' as any) || 'No conversations yet'}
                </Text>
            )}

            {/* Ask Question Modal */}
            <Modal
                opened={showAskModal}
                onClose={() => setShowAskModal(false)}
                title={
                    <Group gap="xs">
                        <IconMessageCircleQuestion size={20} />
                        <Text fw={600}>{t('tripDetails.chat.askQuestion' as any) || 'Ask a Question'}</Text>
                    </Group>
                }
            >
                <Stack>
                    <Text size="sm" c="dimmed">
                        {t('tripDetails.chat.askQuestionDesc' as any) || 'Your question will be sent to the driver'}
                    </Text>
                    <Textarea
                        placeholder={t('tripDetails.chat.questionPlaceholder' as any) || 'Type your question...'}
                        value={questionText}
                        onChange={(e) => setQuestionText(e.currentTarget.value)}
                        disabled={askingQuestion}
                        minRows={3}
                        maxRows={6}
                        autosize
                    />
                    <Group justify="flex-end">
                        <Button variant="subtle" onClick={() => setShowAskModal(false)}>
                            {t('common.cancel' as any) || 'Cancel'}
                        </Button>
                        <Button
                            leftSection={<IconSend size={14} />}
                            onClick={askQuestion}
                            loading={askingQuestion}
                            disabled={!questionText.trim()}
                        >
                            {t('tripDetails.chat.send' as any) || 'Send'}
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Stack>
    );
}

/**
 * Extract threads from messages for rider view
 */
function extractRiderThreads(messages: any[], riderId: string): Thread[] {
    const threads: Thread[] = [];

    // Announcements thread (if any announcements exist)
    const announcements = messages.filter(m =>
        m.message_type === 'announcement' || m.message_type === 'answer_public'
    );
    if (announcements.length > 0) {
        const lastAnnouncement = announcements[announcements.length - 1];
        threads.push({
            type: 'announcement',
            id: 'announcements',
            label: 'Announcements',
            preview: lastAnnouncement.content,
            timestamp: lastAnnouncement.created_at
        });
    }

    // DM thread (if any DMs exist)
    const dms = messages.filter(m => m.message_type === 'dm_private');
    if (dms.length > 0) {
        const firstDmId = dms[0].id;
        // Get all DM messages including followups
        const allDmMessages = messages.filter(m =>
            m.message_type === 'dm_private' ||
            (m.message_type === 'followup' && m.parent_message_id === firstDmId)
        );
        const lastDmMessage = allDmMessages[allDmMessages.length - 1];
        threads.push({
            type: 'dm',
            id: 'dm',
            label: 'Direct Messages',
            preview: lastDmMessage.content,
            timestamp: lastDmMessage.created_at,
            parentMessageId: firstDmId
        });
    }

    // Question threads (each question is its own thread)
    const questions = messages.filter(m =>
        m.message_type === 'question' &&
        m.sender_id === riderId
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
            preview: lastMessage.content,
            timestamp: lastMessage.created_at,
            parentMessageId: q.id
        });
    });

    return threads;
}
