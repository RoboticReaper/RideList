'use client';

import { useState, useEffect } from 'react';
import { Container, Paper, Center, Loader, Text } from '@mantine/core';
import { useAuth } from '@/components/firebase/AuthContext';
import { ChatInterface } from '@/app/[lang]/(private)/dashboard/[tripId]/components/ChatInterface';
import { useTranslation } from 'react-i18next';

interface GlobalChatViewProps {
    otherUserId: string;
    onBack: () => void;
}

interface Message {
    id: string;
    content: string;
    sender_id: string;
    created_at: string;
    is_me: boolean;
    message_type?: string;
    content_type?: string;
    parent_message_id?: string | null;
    is_global_dm?: boolean;
}

interface DMPermissions {
    hasBooking: boolean;
    canSend: boolean;
    otherHasReplied: boolean;
    messagesSent: number;
    limit: number;
}

export function GlobalChatView({ otherUserId, onBack }: GlobalChatViewProps) {
    const { user } = useAuth();
    const { t } = useTranslation('common');
    const [messages, setMessages] = useState<Message[]>([]);
    const [otherUser, setOtherUser] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [permissions, setPermissions] = useState<DMPermissions | null>(null);

    useEffect(() => {
        if (!user || !otherUserId) return;

        const fetchData = async () => {
            try {
                const token = await user.getIdToken();
                const headers = { 'Authorization': `Bearer ${token}` };

                // Fetch other user profile
                const profileRes = await fetch(`/api/user/${otherUserId}`, { headers });
                if (profileRes.ok) {
                    const profileData = await profileRes.json();
                    setOtherUser(profileData);
                }

                // Fetch messages + permissions
                const msgRes = await fetch(`/api/user/chat?other_user_id=${otherUserId}`, { headers });
                if (msgRes.ok) {
                    const msgData = await msgRes.json();
                    const formattedMsgs = (msgData.messages || []).map((m: any) => ({
                        ...m,
                        is_me: m.sender_id === user.uid,
                        is_global_dm: true
                    }));
                    setMessages(formattedMsgs);
                    if (msgData.permissions) {
                        setPermissions(msgData.permissions);
                    }
                } else {
                    setError('Failed to load messages');
                }
            } catch (err) {
                console.error(err);
                setError('Failed to load messages');
            } finally {
                setLoading(false);
            }
        };

        fetchData();

        // Optional polling could go here
        const interval = setInterval(fetchData, 10000); // 10s poll
        return () => clearInterval(interval);
    }, [user, otherUserId]);

    const handleSend = async (content: string, replyToMessageId?: string, imageData?: string) => {
        if (!user) return;
        setSending(true);
        try {
            const token = await user.getIdToken();
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            };

            // Send image first if present
            if (imageData) {
                const imgRes = await fetch('/api/user/chat', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        receiver_id: otherUserId,
                        content: '',
                        message_type: 'image',
                        image_data: imageData,
                        parent_message_id: replyToMessageId
                    })
                });
                if (imgRes.ok) {
                    const newMsg = await imgRes.json();
                    setMessages(prev => [...prev, { ...newMsg, is_me: true, is_global_dm: true }]);
                    // Update permission state optimistically
                    if (permissions && !permissions.hasBooking && !permissions.otherHasReplied) {
                        setPermissions(prev => prev ? { ...prev, messagesSent: prev.messagesSent + 1, canSend: prev.messagesSent + 1 < prev.limit } : prev);
                    }
                }
            }

            // Send text separately if present
            if (content.trim()) {
                const txtRes = await fetch('/api/user/chat', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        receiver_id: otherUserId,
                        content,
                        message_type: 'text',
                        parent_message_id: replyToMessageId
                    })
                });
                if (txtRes.ok) {
                    const newMsg = await txtRes.json();
                    setMessages(prev => [...prev, { ...newMsg, is_me: true, is_global_dm: true }]);
                    // Update permission state optimistically
                    if (permissions && !permissions.hasBooking && !permissions.otherHasReplied) {
                        setPermissions(prev => prev ? { ...prev, messagesSent: prev.messagesSent + 1, canSend: prev.messagesSent + 1 < prev.limit } : prev);
                    }
                }
            }
        } catch (err) {
            console.error('Failed to send message', err);
        } finally {
            setSending(false);
        }
    };

    const handleDelete = async (messageId: string) => {
        if (!user) return;
        try {
            const token = await user.getIdToken();
            const res = await fetch(`/api/user/chat?message_id=${messageId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                setMessages(prev => prev.filter(m => m.id !== messageId));
            }
        } catch (err) {
            console.error('Failed to delete message', err);
        }
    };

    // Compute permission notice and disable state
    const showPermissionNotice = permissions && !permissions.hasBooking && !permissions.otherHasReplied;
    const disableSend = permissions ? !permissions.canSend : false;
    const permissionNotice = showPermissionNotice
        ? (disableSend
            ? ((t as any)('dm.limitReached') || 'Message limit reached. Wait for a reply to continue the conversation.')
            : ((t as any)('dm.limitNotice', { limit: permissions?.limit || 3, sent: permissions?.messagesSent || 0 }) || `You can send up to ${permissions?.limit || 3} messages. The other person must reply before you can send more. (${permissions?.messagesSent || 0}/${permissions?.limit || 3})`))
        : undefined;

    if (loading && !otherUser) {
        return (
            <Container size="md" py="xl">
                <Center h={400}><Loader /></Center>
            </Container>
        );
    }

    if (error) {
        return (
            <Container size="md" py="xl">
                <Paper withBorder p="xl" ta="center">
                    <Text c="red">{error}</Text>
                </Paper>
            </Container>
        );
    }

    return (
        <Container size="md" py="xl" style={{ height: 'calc(100vh - 60px)', display: 'flex', flexDirection: 'column' }}>
            <Paper withBorder style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <ChatInterface
                    messages={messages}
                    onSend={handleSend}
                    onDelete={handleDelete}
                    recipientName={otherUser?.name || 'User'}
                    recipientPhotoUrl={otherUser?.photo_url || null}
                    onBack={onBack}
                    sending={sending}
                    disableSend={disableSend}
                    permissionNotice={permissionNotice}
                />
            </Paper>
        </Container>
    );
}
