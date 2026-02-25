'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Box, Loader, Alert, Paper, Textarea, Button, Group, Text, Stack, Modal, ScrollArea, Avatar, ActionIcon, TextInput, Switch } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconSpeakerphone, IconSend, IconHistory, IconCheck, IconX, IconArrowLeft, IconWorld } from '@tabler/icons-react';
import { ChatSubjectList } from './ChatSubjectList';
import { ChatInterface } from './ChatInterface';
import { ThreadListView, Thread, extractThreadsFromMessages } from './ThreadListView';
import { useAuth } from '@/components/firebase/AuthContext';
import { useTranslation } from 'react-i18next';
import dayjs from '@/utils/dateUtils';

interface DriverChatViewProps {
    tripId: string;
    manualRefreshId?: number;
}

interface Rider {
    rider_id: string;
    rider_name: string;
    rider_photo_url: string | null;
    status: string; // active booking status
    payment_evidence_url?: string | null;
    payment_evidence_text?: string | null;
}

export function DriverChatView({ tripId, manualRefreshId }: DriverChatViewProps) {
    const { user } = useAuth();
    const { t } = useTranslation('common');
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const [activeRider, setActiveRider] = useState<Rider | null>(null);
    const [activeThread, setActiveThread] = useState<Thread | null>(null);
    const [riders, setRiders] = useState<Rider[]>([]);
    const [allMessages, setAllMessages] = useState<any[]>([]); // All messages for the rider
    const [threadMessages, setThreadMessages] = useState<any[]>([]); // Filtered for thread
    const [threads, setThreads] = useState<Thread[]>([]);
    const [loadingRiders, setLoadingRiders] = useState(true);
    const [loadingChat, setLoadingChat] = useState(false);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [announcementText, setAnnouncementText] = useState('');
    const [sendingAnnouncement, setSendingAnnouncement] = useState(false);
    const [viewingAnnouncements, setViewingAnnouncements] = useState(false);
    const [announcements, setAnnouncements] = useState<any[]>([]);
    const [loadingAnnouncements, setLoadingAnnouncements] = useState(false);

    // URL sync tracking - track previous values to detect changes
    const prevChatRecipient = useRef<string | null>(null);
    const prevChatThread = useRef<string | null>(null);

    // Public reply state
    const [publicReplyEnabled, setPublicReplyEnabled] = useState(false);
    const [showPublicReplyModal, setShowPublicReplyModal] = useState(false);
    const [publicReplyText, setPublicReplyText] = useState('');
    const [sendingPublicReply, setSendingPublicReply] = useState(false);

    // Fetch Riders (Subjects)
    const fetchRiders = useCallback(async () => {
        if (!user) return;
        try {
            const token = await user.getIdToken();
            const res = await fetch(`/api/trips/${tripId}/bookings`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error("Failed to load riders");
            const data = await res.json();

            const riderListRaw = data.bookings.map((b: any) => ({
                rider_id: b.rider_id,
                rider_name: b.rider_name,
                rider_photo_url: b.rider_photo_url,
                status: b.status,
                created_at: b.created_at,
                payment_evidence_url: b.payment_evidence_url,
                payment_evidence_text: b.payment_evidence_text
            }));

            // Sort by created_at ascending so newest booking comes last (wins in dedup)
            // The API already handles name redaction based on status
            riderListRaw.sort((a: any, b: any) =>
                new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );

            // Dedupe riders - "last one wins" (newest booking)
            const uniqueRidersMap = new Map();
            riderListRaw.forEach((r: any) => {
                uniqueRidersMap.set(r.rider_id, r);
            });
            const uniqueRiders = Array.from(uniqueRidersMap.values()) as Rider[];

            setRiders(uniqueRiders);
        } catch (err: any) {
            console.error(err);
            setError("Failed to load rider list");
        } finally {
            setLoadingRiders(false);
        }
    }, [user, tripId]);

    // Helper to update URL params without navigation
    const updateUrlParams = useCallback((riderId: string | null, threadId: string | null) => {
        const params = new URLSearchParams(searchParams.toString());

        if (riderId) {
            params.set('chat_recipient', riderId);
        } else {
            params.delete('chat_recipient');
        }

        if (threadId) {
            params.set('chat_thread', threadId);
        } else {
            params.delete('chat_thread');
        }

        const newUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
        router.replace(newUrl, { scroll: false });
    }, [pathname, router, searchParams]);

    useEffect(() => {
        fetchRiders();
    }, [fetchRiders]);

    // Refresh riders when manualRefreshId changes (triggered by parent refresh button)
    useEffect(() => {
        if (manualRefreshId !== undefined && manualRefreshId > 0) {
            fetchRiders();
        }
    }, [manualRefreshId, fetchRiders]);

    // Sync state from URL params whenever they change (including navigation from notifications)
    useEffect(() => {
        if (loadingRiders || riders.length === 0) return;

        const chatRiderId = searchParams.get('chat_recipient');
        const chatThreadId = searchParams.get('chat_thread');

        // Detect if params have changed
        const recipientChanged = chatRiderId !== prevChatRecipient.current;
        const threadChanged = chatThreadId !== prevChatThread.current;

        // Update previous values
        prevChatRecipient.current = chatRiderId;
        prevChatThread.current = chatThreadId;

        // If neither changed, no need to update
        if (!recipientChanged && !threadChanged) return;

        // Handle recipient changes
        if (recipientChanged) {
            if (chatRiderId) {
                const rider = riders.find(r => r.rider_id === chatRiderId);
                if (rider) {
                    setActiveRider(rider);
                    // Reset thread since we switched riders
                    setActiveThread(null);

                    // Store pending thread ID if provided
                    if (chatThreadId) {
                        (window as any).__pendingChatThreadId = chatThreadId;
                    }
                }
            } else {
                // No recipient in URL, clear the view
                setActiveRider(null);
                setActiveThread(null);
            }
        } else if (threadChanged && activeRider) {
            // Only thread changed, not recipient
            if (chatThreadId && threads.length > 0) {
                const thread = threads.find(t =>
                    t.parentMessageId === chatThreadId ||
                    t.id === chatThreadId ||
                    (chatThreadId === 'dm' && t.type === 'dm')
                );
                if (thread) {
                    setActiveThread(thread);
                }
            } else if (!chatThreadId) {
                setActiveThread(null);
            }
        }
    }, [riders, loadingRiders, searchParams, threads, activeRider]);

    // Fetch ALL Chat Messages for Active Rider (to build thread list)
    const fetchChatForRider = useCallback(async () => {
        if (!user || !activeRider) return;
        try {
            const token = await user.getIdToken();
            const res = await fetch(`/api/trips/${tripId}/chat`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error("Failed to load chat");
            const data = await res.json();

            // Filter messages relevant to this rider
            const msgMap = new Map(data.messages.map((m: any) => [m.id, m]));

            const riderMessages = data.messages.filter((m: any) => {
                const isDirect = (m.sender_id === activeRider.rider_id || m.receiver_id === activeRider.rider_id);
                if (isDirect) return true;

                // If it's an answer from driver, check parent
                if (m.parent_message_id) {
                    const parent = msgMap.get(m.parent_message_id);
                    if (parent && (parent as any).sender_id === activeRider.rider_id) {
                        return true;
                    }
                }
                return false;
            }).map((m: any) => ({
                ...m,
                is_me: m.sender_id === user.uid
            }));

            setAllMessages(riderMessages);

            // Extract threads
            const extractedThreads = extractThreadsFromMessages(riderMessages, activeRider.rider_id, user.uid);
            setThreads(extractedThreads);

            // Check for pending thread from URL params
            const pendingThreadId = (window as any).__pendingChatThreadId;
            if (pendingThreadId && extractedThreads.length > 0) {
                const thread = extractedThreads.find(t =>
                    t.parentMessageId === pendingThreadId ||
                    t.id === pendingThreadId ||
                    (pendingThreadId === 'dm' && t.type === 'dm')
                );
                if (thread) {
                    setActiveThread(thread);
                }
                delete (window as any).__pendingChatThreadId;
            }

        } catch (err) {
            console.error(err);
        } finally {
            setLoadingChat(false);
        }
    }, [user, tripId, activeRider]);

    useEffect(() => {
        if (activeRider && !activeThread) {
            setLoadingChat(true);
            fetchChatForRider();
            const interval = setInterval(fetchChatForRider, 5000);
            return () => clearInterval(interval);
        }
    }, [activeRider, activeThread, fetchChatForRider]);

    // Filter messages for specific thread when thread is selected
    useEffect(() => {
        if (!activeThread || !allMessages.length) {
            setThreadMessages([]);
            return;
        }

        if (activeThread.type === 'dm') {
            // Show DM messages and followups to the first DM
            const firstDm = allMessages.find(m => m.message_type === 'dm_private');
            const firstDmId = firstDm?.id;
            const dms = allMessages.filter(m =>
                m.message_type === 'dm_private' ||
                (m.message_type === 'followup' && m.parent_message_id === firstDmId)
            );
            setThreadMessages(dms);
        } else if (activeThread.type === 'question') {
            // Show the question and all replies to it
            const questionId = activeThread.parentMessageId;
            const threadMsgs = allMessages.filter(m =>
                m.id === questionId || // The question itself
                m.parent_message_id === questionId || // Direct replies
                (m.message_type === 'followup' && m.parent_message_id === questionId) // Followups
            );
            setThreadMessages(threadMsgs);
        }
    }, [activeThread, allMessages]);

    // Poll for thread messages when in thread view
    useEffect(() => {
        if (activeRider && activeThread) {
            const interval = setInterval(fetchChatForRider, 5000);
            return () => clearInterval(interval);
        }
    }, [activeRider, activeThread, fetchChatForRider]);

    const sendMessage = async (content: string) => {
        if (!user || !activeRider) return;
        setSending(true);
        try {
            const token = await user.getIdToken();

            let payload: any;
            if (activeThread?.type === 'question') {
                // Reply to question as private answer
                payload = {
                    content,
                    message_type: 'answer_private',
                    parent_message_id: activeThread.parentMessageId,
                    receiver_id: activeRider.rider_id
                };
            } else {
                // Regular DM - check if there's already a first DM message
                const firstDm = allMessages.find(m => m.message_type === 'dm_private');

                if (firstDm) {
                    // There's already a DM thread - send as followup
                    payload = {
                        content,
                        message_type: 'dm_private',
                        parent_message_id: firstDm.id,
                        receiver_id: activeRider.rider_id
                    };
                } else {
                    // First DM message - no parent
                    payload = {
                        content,
                        message_type: 'dm_private',
                        receiver_id: activeRider.rider_id
                    };
                }
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
                    title: t('common.error') || 'Error',
                    message: errorData.error || t('tripDetails.chat.sendFailed') || 'Failed to send message',
                    color: 'red',
                    icon: <IconX size={16} />,
                    autoClose: 5000
                });
                return;
            }

            await fetchChatForRider();
        } catch (err) {
            console.error(err);
            notifications.show({
                title: t('common.error') || 'Error',
                message: t('tripDetails.chat.sendFailed') || 'Failed to send message',
                color: 'red',
                icon: <IconX size={16} />,
                autoClose: 5000
            });
        } finally {
            setSending(false);
        }
    };

    const sendAnnouncement = async () => {
        if (!user || !announcementText.trim()) return;
        setSendingAnnouncement(true);
        try {
            const token = await user.getIdToken();
            const payload = {
                content: announcementText.trim(),
                message_type: 'announcement'
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
                setAnnouncementText('');
                notifications.show({
                    title: t('tripDetails.chat.announcementSent') || 'Announcement Sent',
                    message: t('tripDetails.chat.announcementSentDesc') || 'Your announcement has been sent to all riders',
                    color: 'green',
                    icon: <IconCheck size={16} />,
                    autoClose: 3000
                });
            } else {
                const errorData = await res.json();
                notifications.show({
                    title: t('common.error') || 'Error',
                    message: errorData.error || t('tripDetails.chat.announcementFailed') || 'Failed to send announcement',
                    color: 'red',
                    icon: <IconX size={16} />,
                    autoClose: 5000
                });
            }
        } catch (err) {
            console.error(err);
            notifications.show({
                title: t('common.error') || 'Error',
                message: t('tripDetails.chat.announcementFailed') || 'Failed to send announcement',
                color: 'red',
                icon: <IconX size={16} />,
                autoClose: 5000
            });
        } finally {
            setSendingAnnouncement(false);
        }
    };

    const fetchAnnouncements = useCallback(async () => {
        if (!user) return;
        setLoadingAnnouncements(true);
        try {
            const token = await user.getIdToken();
            const res = await fetch(`/api/trips/${tripId}/chat`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error("Failed to load chat");
            const data = await res.json();

            // Get all messages to find original questions
            const allMsgs = data.messages;

            // Filter announcements and answer_public messages, attaching original question for public answers
            const announcementMsgs = allMsgs.filter((m: any) =>
                m.message_type === 'announcement' || m.message_type === 'answer_public'
            ).map((m: any) => {
                let originalQuestion = '';
                if (m.message_type === 'answer_public' && m.parent_message_id) {
                    const parentQ = allMsgs.find((q: any) => q.id === m.parent_message_id);
                    originalQuestion = parentQ?.content || '';
                }
                return {
                    ...m,
                    is_me: m.sender_id === user.uid,
                    original_question: originalQuestion
                };
            });

            setAnnouncements(announcementMsgs);
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingAnnouncements(false);
        }
    }, [user, tripId]);

    const openAnnouncementsModal = () => {
        setViewingAnnouncements(true);
        fetchAnnouncements();
    };

    const deleteMessage = useCallback(async (messageId: string) => {
        if (!user) return;
        try {
            const token = await user.getIdToken();
            const res = await fetch(`/api/trips/${tripId}/chat?message_id=${messageId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Failed to delete message');

            // Refresh appropriate data based on current view
            if (viewingAnnouncements) {
                fetchAnnouncements();
            } else if (activeRider) {
                // Refresh thread messages
                fetchChatForRider();
            }

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
    }, [user, tripId, fetchAnnouncements, viewingAnnouncements, activeRider, fetchChatForRider, t]);

    // Get the original question content for the current thread
    const getOriginalQuestion = () => {
        if (!activeThread?.parentMessageId || !allMessages.length) return '';
        const question = allMessages.find(m => m.id === activeThread.parentMessageId);
        return question?.content || '';
    };

    const sendPublicReply = async () => {
        if (!user || !activeRider || !activeThread || !publicReplyText.trim()) return;
        setSendingPublicReply(true);
        try {
            const token = await user.getIdToken();
            const payload = {
                content: publicReplyText.trim(),
                message_type: 'answer_public',
                parent_message_id: activeThread.parentMessageId,
                receiver_id: activeRider.rider_id
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
                setPublicReplyText('');
                setShowPublicReplyModal(false);
                setPublicReplyEnabled(false);
                notifications.show({
                    title: t('tripDetails.chat.publicReplySent') || 'Public Reply Sent',
                    message: t('tripDetails.chat.publicReplySentDesc') || 'Your reply is now visible to all riders',
                    color: 'green',
                    icon: <IconCheck size={16} />,
                    autoClose: 3000
                });
                await fetchChatForRider();
            } else {
                const errorData = await res.json();
                notifications.show({
                    title: t('common.error') || 'Error',
                    message: errorData.error || t('tripDetails.chat.sendFailed') || 'Failed to send reply',
                    color: 'red',
                    icon: <IconX size={16} />,
                    autoClose: 5000
                });
            }
        } catch (err) {
            console.error(err);
            notifications.show({
                title: t('common.error') || 'Error',
                message: t('tripDetails.chat.sendFailed') || 'Failed to send reply',
                color: 'red',
                icon: <IconX size={16} />,
                autoClose: 5000
            });
        } finally {
            setSendingPublicReply(false);
        }
    };

    const handleSelectRider = (rider: Rider) => {
        setActiveRider(rider);
        setActiveThread(null);
        setThreadMessages([]);
        updateUrlParams(rider.rider_id, null);
    };

    const handleSelectThread = (thread: Thread) => {
        setActiveThread(thread);
        updateUrlParams(activeRider?.rider_id || null, thread.parentMessageId || thread.id);
    };

    const handleBackFromThread = () => {
        setActiveThread(null);
        setThreadMessages([]);
        updateUrlParams(activeRider?.rider_id || null, null);
    };

    const handleBackFromThreadList = () => {
        setActiveRider(null);
        setActiveThread(null);
        setAllMessages([]);
        setThreads([]);
        updateUrlParams(null, null);
    };

    if (loadingRiders) return <Box p="xl" ta="center"><Loader /></Box>;
    if (error) return <Alert color="red">{error}</Alert>;

    // View: Chat Interface (inside a thread)
    if (activeRider && activeThread) {
        const isQuestionThread = activeThread.type === 'question';

        // Custom send handler that shows modal when public toggle is on
        const handleSend = async (content: string) => {
            if (isQuestionThread && publicReplyEnabled) {
                // Store the content and show confirmation modal
                setPublicReplyText(content);
                setShowPublicReplyModal(true);
            } else {
                // Normal send
                await sendMessage(content);
            }
        };

        return (
            <Box style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 200, background: 'white' }}>
                <ChatInterface
                    messages={threadMessages}
                    onSend={handleSend}
                    onDelete={deleteMessage}
                    recipientName={activeThread.type === 'dm'
                        ? activeRider.rider_name
                        : `${activeRider.rider_name} - ${t('tripDetails.chat.question') || 'Question'}`}
                    recipientPhotoUrl={activeRider.rider_photo_url}
                    onBack={handleBackFromThread}
                    loading={loadingChat && threadMessages.length === 0}
                    sending={sending || sendingPublicReply}
                    showPublicToggle={isQuestionThread}
                    publicReplyEnabled={publicReplyEnabled}
                    onPublicReplyToggle={setPublicReplyEnabled}
                />

                {/* Public Reply Confirmation Modal */}
                <Modal
                    opened={showPublicReplyModal}
                    onClose={() => {
                        setShowPublicReplyModal(false);
                        setPublicReplyText('');
                    }}
                    zIndex={300}
                    title={
                        <Group gap="xs">
                            <IconWorld size={20} color="var(--mantine-color-green-6)" />
                            <Text fw={600}>{t('tripDetails.chat.replyPublicly') || 'Reply Publicly'}</Text>
                        </Group>
                    }
                    size="lg"
                >
                    <Stack>
                        <Alert color="yellow" variant="light">
                            <Text size="sm">
                                {t('tripDetails.chat.publicReplyWarning') || 'The original question and your reply will both be visible to everyone in the trip.'}
                            </Text>
                        </Alert>

                        <Paper p="md" withBorder radius="md" bg="gray.0">
                            <Text size="xs" c="dimmed" mb="xs" fw={600}>
                                {t('tripDetails.chat.originalQuestion') || 'Original Question'}
                            </Text>
                            <Text size="sm">{getOriginalQuestion()}</Text>
                        </Paper>

                        <Paper p="md" withBorder radius="md" bg="green.0">
                            <Text size="xs" c="dimmed" mb="xs" fw={600}>
                                {t('tripDetails.chat.yourReply') || 'Your Reply'}
                            </Text>
                            <Text size="sm">{publicReplyText}</Text>
                        </Paper>

                        <Group justify="flex-end">
                            <Button
                                variant="subtle"
                                onClick={() => {
                                    setShowPublicReplyModal(false);
                                    setPublicReplyText('');
                                    setPublicReplyEnabled(false);
                                }}
                            >
                                {t('common.cancel') || 'Cancel'}
                            </Button>
                            <Button
                                color="green"
                                leftSection={<IconWorld size={14} />}
                                onClick={sendPublicReply}
                                loading={sendingPublicReply}
                                disabled={!publicReplyText.trim()}
                            >
                                {t('tripDetails.chat.sendPublicReply') || 'Send Public Reply'}
                            </Button>
                        </Group>
                    </Stack>
                </Modal>
            </Box >
        );
    }

    // View: Thread List (rider selected, choosing thread)
    if (activeRider) {
        return (
            <Box style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 200, background: 'white' }}>
                <ThreadListView
                    riderName={activeRider.rider_name}
                    riderPhotoUrl={activeRider.rider_photo_url}
                    threads={threads}
                    onSelectThread={handleSelectThread}
                    onBack={handleBackFromThreadList}
                    paymentEvidenceUrl={activeRider.payment_evidence_url}
                    paymentEvidenceText={activeRider.payment_evidence_text}
                />
            </Box>
        );
    }

    // View: Rider List (initial view)
    return (
        <Stack gap="md">
            {/* Announcement Section */}
            <Paper p="md" withBorder radius="md" bg="blue.0">
                <Group gap="xs" mb="xs" justify="space-between">
                    <Group gap="xs">
                        <IconSpeakerphone size={18} color="var(--mantine-color-blue-6)" />
                        <Text fw={600} size="sm" c="blue.7">{t('tripDetails.chat.announcement')}</Text>
                    </Group>
                    <Button
                        size="xs"
                        variant="subtle"
                        leftSection={<IconHistory size={14} />}
                        onClick={openAnnouncementsModal}
                    >
                        {t('tripDetails.chat.viewHistory') || 'View History'}
                    </Button>
                </Group>
                <Text size="xs" c="dimmed" mb="sm">{t('tripDetails.chat.announcementDesc')}</Text>
                <Textarea
                    placeholder={t('tripDetails.chat.announcementPlaceholder')}
                    value={announcementText}
                    onChange={(e) => setAnnouncementText(e.currentTarget.value)}
                    disabled={sendingAnnouncement}
                    minRows={2}
                    autosize
                />
                <Group justify="flex-end" mt="sm">
                    <Button
                        size="xs"
                        leftSection={<IconSend size={14} />}
                        onClick={sendAnnouncement}
                        loading={sendingAnnouncement}
                        disabled={!announcementText.trim()}
                    >
                        {t('tripDetails.chat.sendAnnouncement')}
                    </Button>
                </Group>
            </Paper>

            {/* Rider List */}
            <ChatSubjectList riders={riders} onSelect={handleSelectRider} />

            {/* Announcements History View */}
            {viewingAnnouncements && (
                <Box style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 200, background: 'white' }}>
                    <ChatInterface
                        messages={announcements}
                        recipientName={t('tripDetails.chat.announcementHistory') || 'Announcement History'}
                        recipientPhotoUrl={null}
                        onBack={() => setViewingAnnouncements(false)}
                        loading={loadingAnnouncements}
                        onDelete={deleteMessage}
                    />
                </Box>
            )}
        </Stack>
    );
}
