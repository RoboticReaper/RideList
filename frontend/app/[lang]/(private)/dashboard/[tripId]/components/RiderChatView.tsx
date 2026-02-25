'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
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
    driverId?: string;
}

interface Thread {
    type: 'announcement' | 'dm' | 'question';
    id: string;
    label: string;
    preview: string;
    timestamp: string;
    parentMessageId?: string;
}

export function RiderChatView({ tripId, driverName, driverPhotoUrl, driverId }: RiderChatViewProps) {
    const { user } = useAuth();
    const { t } = useTranslation('common');
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const [activeThread, setActiveThread] = useState<Thread | null>(null);
    const [messages, setMessages] = useState<any[]>([]);
    const [threadMessages, setThreadMessages] = useState<any[]>([]);
    const [threads, setThreads] = useState<Thread[]>([]);
    const [loadingChat, setLoadingChat] = useState(true);
    const [sending, setSending] = useState(false);
    const [questionText, setQuestionText] = useState('');
    const [askingQuestion, setAskingQuestion] = useState(false);
    const [showAskModal, setShowAskModal] = useState(false);

    // URL sync tracking - track previous value to detect changes
    const prevChatThread = useRef<string | null>(null);

    // Helper to update URL params
    const updateUrlParams = useCallback((threadId: string | null) => {
        const params = new URLSearchParams(searchParams.toString());

        if (threadId) {
            params.set('chat_thread', threadId);
        } else {
            params.delete('chat_thread');
        }

        const newUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
        router.replace(newUrl, { scroll: false });
    }, [pathname, router, searchParams]);

    // Fetch all messages for this trip
    const fetchMessages = useCallback(async () => {
        if (!user) return;
        try {
            const token = await user.getIdToken();
            const [tripRes, dmRes] = await Promise.all([
                fetch(`/api/trips/${tripId}/chat`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                }),
                driverId ? fetch(`/api/user/chat?other_user_id=${driverId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                }) : Promise.resolve(new Response(JSON.stringify({ messages: [] }), { status: 200 }))
            ]);

            if (!tripRes.ok) throw new Error("Failed to load chat");
            const tripData = await tripRes.json();
            const dmData = dmRes.ok ? await dmRes.json() : { messages: [] };

            const tripMsgs = tripData.messages.map((m: any) => ({
                ...m,
                is_me: m.sender_id === user.uid
            }));

            const globalDMs = dmData.messages.map((m: any) => ({
                ...m,
                is_me: m.sender_id === user.uid,
                is_global_dm: true,
                message_type: m.message_type || 'dm_private'
            }));

            const combinedMsgs = [...tripMsgs, ...globalDMs].sort((a, b) =>
                new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );

            setMessages(combinedMsgs);

            // Extract threads from messages
            const extractedThreads = extractRiderThreads(combinedMsgs, user.uid);
            setThreads(extractedThreads);
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingChat(false);
        }
    }, [user, tripId]);

    // Sync thread from URL params whenever they change (including navigation from notifications)
    useEffect(() => {
        if (threads.length === 0) return;

        const chatThreadId = searchParams.get('chat_thread');

        // Detect if param has changed
        if (chatThreadId === prevChatThread.current) return;

        // Update previous value
        prevChatThread.current = chatThreadId;

        if (chatThreadId) {
            const thread = threads.find(t =>
                t.parentMessageId === chatThreadId || t.id === chatThreadId || t.type === chatThreadId
            );
            if (thread) {
                setActiveThread(thread);
            }
        } else {
            setActiveThread(null);
        }
    }, [threads, searchParams]);

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
            // Show all announcements and public answers with original questions attached
            const announcementMsgs = messages.filter(m =>
                m.message_type === 'announcement' || m.message_type === 'answer_public'
            ).map(m => {
                if (m.message_type === 'answer_public' && m.parent_message_id) {
                    const parentQ = messages.find(q => q.id === m.parent_message_id);
                    return { ...m, original_question: parentQ?.content || '' };
                }
                return m;
            });
            setThreadMessages(announcementMsgs);
        } else if (activeThread.type === 'dm') {
            // Show global DMs
            const dmMsgs = messages.filter(m => m.is_global_dm);
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

    const sendMessage = async (content: string, replyToMessageId?: string, imageData?: string) => {
        if (!user) return;
        setSending(true);
        try {
            const token = await user.getIdToken();

            const sendSingleMessage = async (msgContent: string, msgImageData?: string) => {
                let payload: any;
                let targetUrl = `/api/trips/${tripId}/chat`;

                if (activeThread?.type === 'question') {
                    payload = {
                        content: msgContent || '📷 Image',
                        message_type: 'followup',
                        parent_message_id: activeThread.parentMessageId,
                        ...(msgImageData && { image_data: msgImageData })
                    };
                } else if (activeThread?.type === 'dm') {
                    targetUrl = '/api/user/chat';
                    payload = {
                        content: msgContent || '📷 Image',
                        receiver_id: driverId,
                        context_trip_id: tripId,
                        message_type: 'text',
                        ...(replyToMessageId && { parent_message_id: replyToMessageId }),
                        ...(msgImageData && { image_data: msgImageData })
                    };
                } else {
                    return;
                }

                const res = await fetch(targetUrl, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });

                if (!res.ok) {
                    const errorData = await res.json();
                    throw new Error(errorData.error || t('tripDetails.chat.sendFailed') || 'Failed to send message');
                }
            };

            if (imageData && content.trim()) {
                // Send image first, then text as separate messages
                await sendSingleMessage('', imageData);
                await sendSingleMessage(content.trim());
            } else {
                await sendSingleMessage(content, imageData);
            }

            await fetchMessages();
        } catch (err: any) {
            console.error(err);
            notifications.show({
                title: t('common.error') || 'Error',
                message: err.message || t('tripDetails.chat.sendFailed') || 'Failed to send message',
                color: 'red',
                icon: <IconX size={16} />,
                autoClose: 5000
            });
        } finally {
            setSending(false);
        }
    };

    const deleteMessage = useCallback(async (messageId: string) => {
        if (!user) return;

        const msg = messages.find(m => m.id === messageId);
        const isGlobalDm = msg?.is_global_dm === true;

        try {
            const token = await user.getIdToken();
            const targetUrl = isGlobalDm
                ? `/api/user/chat?message_id=${messageId}`
                : `/api/trips/${tripId}/chat?message_id=${messageId}`;

            const res = await fetch(targetUrl, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Failed to delete message');

            // Refresh messages after successful deletion
            await fetchMessages();

            notifications.show({
                title: t('common.success') || 'Success',
                message: t('tripDetails.chat.messageDeleted') || 'Message deleted',
                color: 'green',
                icon: <IconCheck size={16} />,
                autoClose: 3000
            });
        } catch (err) {
            console.error(err);
            notifications.show({
                title: t('common.error') || 'Error',
                message: t('tripDetails.chat.deleteFailed') || 'Failed to delete message',
                color: 'red',
                icon: <IconX size={16} />,
                autoClose: 5000
            });
        }
    }, [user, tripId, messages, fetchMessages, t]);

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
                    title: t('tripDetails.chat.questionSent') || 'Question Sent',
                    message: t('tripDetails.chat.questionSentDesc') || 'Your question has been sent to the driver',
                    color: 'green',
                    icon: <IconCheck size={16} />,
                    autoClose: 3000
                });
                await fetchMessages();
            } else {
                const errorData = await res.json();
                notifications.show({
                    title: t('common.error') || 'Error',
                    message: errorData.error || t('tripDetails.chat.sendFailed') || 'Failed to send question',
                    color: 'red',
                    icon: <IconX size={16} />,
                    autoClose: 5000
                });
            }
        } catch (err) {
            console.error(err);
            notifications.show({
                title: t('common.error') || 'Error',
                message: t('tripDetails.chat.sendFailed') || 'Failed to send question',
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
                    onDelete={activeThread.type !== 'announcement' ? deleteMessage : undefined}
                    recipientName={activeThread.type === 'announcement'
                        ? (t('tripDetails.chat.announcements') || 'Announcements')
                        : (driverName || t('tripDetails.chat.driver') || 'Driver')}
                    recipientPhotoUrl={activeThread.type === 'announcement' ? null : driverPhotoUrl}
                    onBack={() => { setActiveThread(null); updateUrlParams(null); }}
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
                {t('tripDetails.chat.askQuestion') || 'Ask a Question'}
            </Button>

            {/* Announcements Thread */}
            {announcementThread && (
                <UnstyledButton onClick={() => { setActiveThread(announcementThread); updateUrlParams('announcement'); }} w="100%">
                    <Paper p="md" withBorder radius="md" bg="blue.0">
                        <Group wrap="nowrap" align="center">
                            <IconSpeakerphone size={24} color="var(--mantine-color-blue-6)" />
                            <Stack gap={2} style={{ flex: 1 }}>
                                <Group gap="xs">
                                    <Text fw={600}>{t('tripDetails.chat.announcements') || 'Announcements'}</Text>
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
                <UnstyledButton onClick={() => { setActiveThread(dmThread); updateUrlParams(dmThread.parentMessageId || 'dm'); }} w="100%">
                    <Paper p="md" withBorder radius="md">
                        <Group wrap="nowrap" align="center">
                            <Avatar src={driverPhotoUrl} radius="xl" size="md" color="initials">
                                {driverName?.charAt(0) || 'D'}
                            </Avatar>
                            <Stack gap={2} style={{ flex: 1 }}>
                                <Group gap="xs">
                                    <Text fw={600}>{t('tripDetails.chat.directMessages') || 'Direct Messages'}</Text>
                                    <Badge size="xs" variant="light" color="gray">DM</Badge>
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
                    <Text size="sm" fw={600} c="dimmed" tt="uppercase" mt="sm">
                        {t('tripDetails.chat.yourQuestions') || 'Your Questions'}
                    </Text>
                    {questionThreads.map((qThread) => (
                        <UnstyledButton key={qThread.id} onClick={() => { setActiveThread(qThread); updateUrlParams(qThread.parentMessageId || qThread.id); }} w="100%">
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
                    {t('tripDetails.chat.noThreads') || 'No conversations yet'}
                </Text>
            )}

            {/* Ask Question Modal */}
            <Modal
                opened={showAskModal}
                onClose={() => setShowAskModal(false)}
                title={
                    <Group gap="xs">
                        <IconMessageCircleQuestion size={20} />
                        <Text fw={600}>{t('tripDetails.chat.askQuestion') || 'Ask a Question'}</Text>
                    </Group>
                }
            >
                <Stack>
                    <Text size="sm" c="dimmed">
                        {t('tripDetails.chat.askQuestionDesc') || 'Your question will be sent to the driver'}
                    </Text>
                    <Textarea
                        placeholder={t('tripDetails.chat.questionPlaceholder') || 'Type your question...'}
                        value={questionText}
                        onChange={(e) => setQuestionText(e.currentTarget.value)}
                        disabled={askingQuestion}
                        minRows={3}
                        autosize
                    />
                    <Group justify="flex-end">
                        <Button variant="subtle" onClick={() => setShowAskModal(false)}>
                            {t('common.cancel') || 'Cancel'}
                        </Button>
                        <Button
                            leftSection={<IconSend size={14} />}
                            onClick={askQuestion}
                            loading={askingQuestion}
                            disabled={!questionText.trim()}
                        >
                            {t('tripDetails.chat.send') || 'Send'}
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

    // DM thread (populated with global DMs)
    const dms = messages.filter(m => m.is_global_dm);
    if (dms.length > 0 || true) {
        const lastDmMessage = dms.length > 0 ? dms[dms.length - 1] : null;
        threads.push({
            type: 'dm',
            id: 'dm',
            label: 'Direct Messages',
            preview: lastDmMessage?.content || '',
            timestamp: lastDmMessage?.created_at || new Date().toISOString(),
            parentMessageId: 'dm'
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
