'use client';

import { useState, useEffect } from 'react';
import { Container, Paper, Center, Loader, Text } from '@mantine/core';
import { useAuth } from '@/components/firebase/AuthContext';
import { ChatInterface } from '@/app/[lang]/(private)/dashboard/[tripId]/components/ChatInterface';

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

export function GlobalChatView({ otherUserId, onBack }: GlobalChatViewProps) {
    const { user } = useAuth();
    const [messages, setMessages] = useState<Message[]>([]);
    const [otherUser, setOtherUser] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!user || !otherUserId) return;

        const fetchData = async () => {
            setLoading(true);
            try {
                const token = await user.getIdToken();
                const headers = { 'Authorization': `Bearer ${token}` };

                // Fetch other user profile
                const profileRes = await fetch(`/api/user/${otherUserId}`, { headers });
                if (profileRes.ok) {
                    const profileData = await profileRes.json();
                    setOtherUser(profileData);
                }

                // Fetch messages
                const msgRes = await fetch(`/api/user/chat?other_user_id=${otherUserId}`, { headers });
                if (msgRes.ok) {
                    const msgData = await msgRes.json();
                    const formattedMsgs = (msgData.messages || []).map((m: any) => ({
                        ...m,
                        is_me: m.sender_id === user.uid,
                        is_global_dm: true
                    }));
                    setMessages(formattedMsgs);
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
            const res = await fetch('/api/user/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    receiver_id: otherUserId,
                    content,
                    message_type: imageData ? 'image' : 'text',
                    image_data: imageData,
                    parent_message_id: replyToMessageId
                })
            });

            if (res.ok) {
                const newMsg = await res.json();
                setMessages(prev => [...prev, {
                    ...newMsg,
                    is_me: true,
                    is_global_dm: true
                }]);
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
                />
            </Paper>
        </Container>
    );
}
