'use client';

import { useState, useCallback, useEffect } from 'react';
import { Box, Loader, Alert, Paper, Textarea, Button, Group, Text, Stack, Modal, ScrollArea, Avatar } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconSpeakerphone, IconSend, IconHistory, IconCheck, IconX } from '@tabler/icons-react';
import { ChatSubjectList } from './ChatSubjectList';
import { ChatInterface } from './ChatInterface';
import { ThreadListView, Thread, extractThreadsFromMessages } from './ThreadListView';
import { useAuth } from '@/components/firebase/AuthContext';
import { useTranslation } from 'react-i18next';
import dayjs from '@/utils/dateUtils';

interface DriverChatViewProps {
    tripId: string;
}

interface Rider {
    rider_id: string;
    rider_name: string;
    rider_photo_url: string | null;
    status: string; // active booking status
}

export function DriverChatView({ tripId }: DriverChatViewProps) {
    const { user } = useAuth();
    const { t } = useTranslation('common');
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

            const riderList = data.bookings.map((b: any) => ({
                rider_id: b.rider_id,
                rider_name: b.rider_name,
                rider_photo_url: b.rider_photo_url,
                status: b.status
            }));

            setRiders(riderList);
        } catch (err: any) {
            console.error(err);
            setError("Failed to load rider list");
        } finally {
            setLoadingRiders(false);
        }
    }, [user, tripId]);

    useEffect(() => {
        fetchRiders();
    }, [fetchRiders]);

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
                // Regular DM
                payload = {
                    content,
                    message_type: 'dm_private',
                    receiver_id: activeRider.rider_id
                };
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

            await fetchChatForRider();
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
                    title: t('tripDetails.chat.announcementSent' as any) || 'Announcement Sent',
                    message: t('tripDetails.chat.announcementSentDesc' as any) || 'Your announcement has been sent to all riders',
                    color: 'green',
                    icon: <IconCheck size={16} />,
                    autoClose: 3000
                });
            } else {
                const errorData = await res.json();
                notifications.show({
                    title: t('common.error' as any) || 'Error',
                    message: errorData.error || t('tripDetails.chat.announcementFailed' as any) || 'Failed to send announcement',
                    color: 'red',
                    icon: <IconX size={16} />,
                    autoClose: 5000
                });
            }
        } catch (err) {
            console.error(err);
            notifications.show({
                title: t('common.error' as any) || 'Error',
                message: t('tripDetails.chat.announcementFailed' as any) || 'Failed to send announcement',
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

            // Filter announcements and answer_public messages
            const announcementMsgs = data.messages.filter((m: any) =>
                m.message_type === 'announcement' || m.message_type === 'answer_public'
            ).map((m: any) => ({
                ...m,
                is_me: m.sender_id === user.uid
            }));

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

    const handleSelectRider = (rider: Rider) => {
        setActiveRider(rider);
        setActiveThread(null);
        setThreadMessages([]);
    };

    const handleSelectThread = (thread: Thread) => {
        setActiveThread(thread);
    };

    const handleBackFromThread = () => {
        setActiveThread(null);
        setThreadMessages([]);
    };

    const handleBackFromThreadList = () => {
        setActiveRider(null);
        setActiveThread(null);
        setAllMessages([]);
        setThreads([]);
    };

    if (loadingRiders) return <Box p="xl" ta="center"><Loader /></Box>;
    if (error) return <Alert color="red">{error}</Alert>;

    // View: Chat Interface (inside a thread)
    if (activeRider && activeThread) {
        return (
            <Box style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 200, background: 'white' }}>
                <ChatInterface
                    messages={threadMessages}
                    onSend={sendMessage}
                    recipientName={activeThread.type === 'dm'
                        ? activeRider.rider_name
                        : `${activeRider.rider_name} - ${t('tripDetails.chat.question' as any) || 'Question'}`}
                    recipientPhotoUrl={activeRider.rider_photo_url}
                    onBack={handleBackFromThread}
                    loading={loadingChat && threadMessages.length === 0}
                    sending={sending}
                />
            </Box>
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
                        <Text fw={600} size="sm" c="blue.7">{t('tripDetails.chat.announcement' as any)}</Text>
                    </Group>
                    <Button
                        size="xs"
                        variant="subtle"
                        leftSection={<IconHistory size={14} />}
                        onClick={openAnnouncementsModal}
                    >
                        {t('tripDetails.chat.viewHistory' as any) || 'View History'}
                    </Button>
                </Group>
                <Text size="xs" c="dimmed" mb="sm">{t('tripDetails.chat.announcementDesc' as any)}</Text>
                <Textarea
                    placeholder={t('tripDetails.chat.announcementPlaceholder' as any)}
                    value={announcementText}
                    onChange={(e) => setAnnouncementText(e.currentTarget.value)}
                    disabled={sendingAnnouncement}
                    minRows={2}
                    maxRows={4}
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
                        {t('tripDetails.chat.sendAnnouncement' as any)}
                    </Button>
                </Group>
            </Paper>

            {/* Rider List */}
            <ChatSubjectList riders={riders} onSelect={handleSelectRider} />

            {/* Announcements History Modal */}
            <Modal
                opened={viewingAnnouncements}
                onClose={() => setViewingAnnouncements(false)}
                title={
                    <Group gap="xs">
                        <IconSpeakerphone size={20} />
                        <Text fw={600}>{t('tripDetails.chat.announcementHistory' as any) || 'Announcement History'}</Text>
                    </Group>
                }
                size="lg"
            >
                {loadingAnnouncements ? (
                    <Box ta="center" p="xl">
                        <Loader size="sm" />
                    </Box>
                ) : announcements.length === 0 ? (
                    <Text c="dimmed" ta="center" py="xl">
                        {t('tripDetails.chat.noAnnouncements' as any) || 'No announcements yet'}
                    </Text>
                ) : (
                    <ScrollArea h={400}>
                        <Stack gap="md">
                            {announcements.map((msg) => (
                                <Paper key={msg.id} p="md" withBorder radius="md" bg={msg.message_type === 'announcement' ? 'blue.0' : 'green.0'}>
                                    <Group gap="xs" mb="xs">
                                        {msg.message_type === 'announcement' ? (
                                            <IconSpeakerphone size={16} color="var(--mantine-color-blue-6)" />
                                        ) : (
                                            <Avatar size="xs" radius="xl" color="green">A</Avatar>
                                        )}
                                        <Text size="xs" c="dimmed">
                                            {msg.message_type === 'announcement'
                                                ? (t('tripDetails.chat.announcement' as any) || 'Announcement')
                                                : (t('tripDetails.chat.publicReply' as any) || 'Public Reply')}
                                        </Text>
                                        <Text size="xs" c="dimmed">•</Text>
                                        <Text size="xs" c="dimmed">
                                            {dayjs(msg.created_at).format('MMM D, h:mm A')}
                                        </Text>
                                    </Group>
                                    <Text size="sm">{msg.content}</Text>
                                </Paper>
                            ))}
                        </Stack>
                    </ScrollArea>
                )}
            </Modal>
        </Stack>
    );
}
