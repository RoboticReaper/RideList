'use client';

import { useState, useRef, useEffect } from 'react';
import { Stack, Group, TextInput, ActionIcon, Text, Paper, ScrollArea, Avatar, Box, LoadingOverlay, Switch } from '@mantine/core';
import { IconSend, IconArrowLeft, IconWorld } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

interface Message {
    id: string;
    content: string;
    sender_id: string; // 'driver' messages are from current user if viewing as driver
    created_at: string;
    is_me: boolean;
    message_type?: string;
    original_question?: string;
}

interface ChatInterfaceProps {
    messages: Message[];
    onSend?: (content: string) => Promise<void>;
    recipientName: string;
    recipientPhotoUrl?: string | null;
    onBack: () => void;
    loading?: boolean;
    sending?: boolean;
    // Public reply toggle
    showPublicToggle?: boolean;
    publicReplyEnabled?: boolean;
    onPublicReplyToggle?: (enabled: boolean) => void;
}

export function ChatInterface({
    messages, onSend, recipientName, recipientPhotoUrl, onBack, loading, sending,
    showPublicToggle, publicReplyEnabled, onPublicReplyToggle
}: ChatInterfaceProps) {
    const { t } = useTranslation('common');
    const [inputValue, setInputValue] = useState('');
    const viewport = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        if (viewport.current) {
            viewport.current.scrollTo({ top: viewport.current.scrollHeight, behavior: 'smooth' });
        }
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, loading]);

    const handleSend = async () => {
        if (!inputValue.trim() || !onSend) return;
        const temp = inputValue;
        setInputValue(''); // Optimistic clear
        await onSend(temp);
        scrollToBottom();
    };

    return (
        <Stack h="100%" gap={0} bg="gray.0" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 }}>
            {/* Header */}
            <Paper p="md" shadow="xs" radius={0} withBorder>
                <Group gap="sm">
                    <ActionIcon variant="subtle" color="gray" onClick={onBack}>
                        <IconArrowLeft size={20} />
                    </ActionIcon>
                    <Avatar src={recipientPhotoUrl} radius="xl" size="sm" alt={recipientName} color="initials">
                        {recipientName?.charAt(0)}
                    </Avatar>
                    <Text fw={600} size="lg">{recipientName}</Text>
                </Group>
            </Paper>

            {/* Messages Area */}
            <Box style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                <LoadingOverlay visible={!!loading} overlayProps={{ blur: 1 }} />
                <ScrollArea h="100%" viewportRef={viewport} p="md">
                    <Stack gap="xs">
                        {messages.length === 0 && !loading && (
                            <Text c="dimmed" ta="center" mt="xl" size="sm">
                                {t('tripDetails.chat.noMessages' as any)}
                            </Text>
                        )}
                        {messages.map((msg) => (
                            <Group
                                key={msg.id}
                                justify={msg.is_me ? 'flex-end' : 'flex-start'}
                                align="flex-end"
                                gap={8}
                            >
                                {!msg.is_me && (
                                    <Avatar src={recipientPhotoUrl} radius="xl" size="sm" style={{ width: 24, height: 24 }} />
                                )}
                                <Paper
                                    p="xs"
                                    px="md"
                                    radius="lg"
                                    bg={msg.is_me ? 'blue' : 'gray.2'}
                                    c={msg.is_me ? 'white' : 'dark'}
                                    role="article" // For accessibility
                                    style={{
                                        maxWidth: '75%',
                                        borderBottomRightRadius: msg.is_me ? 4 : undefined,
                                        borderBottomLeftRadius: !msg.is_me ? 4 : undefined
                                    }}
                                >
                                    {/* Show original question for public answers */}
                                    {msg.message_type === 'answer_public' && msg.original_question && (
                                        <Paper p="xs" mb="xs" bg={msg.is_me ? 'blue.7' : 'gray.3'} radius="sm">
                                            <Text size="xs" fw={600} mb={2}>
                                                {t('tripDetails.chat.originalQuestion' as any) || 'Original Question'}
                                            </Text>
                                            <Text size="xs" style={{ wordBreak: 'break-word' }}>{msg.original_question}</Text>
                                        </Paper>
                                    )}
                                    <Text size="sm" style={{ wordBreak: 'break-word' }}>{msg.content}</Text>
                                </Paper>
                            </Group>
                        ))}
                    </Stack>
                </ScrollArea>
            </Box>

            {/* Input Area - only show if onSend is provided */}
            {onSend && (
                <Paper p="sm" shadow="xs" radius={0} withBorder>
                    {/* Public Reply Toggle - shown above input when applicable */}
                    {showPublicToggle && (
                        <Group gap="xs" mb="xs" justify="flex-end">
                            <IconWorld size={14} color={publicReplyEnabled ? 'var(--mantine-color-green-6)' : 'var(--mantine-color-gray-5)'} />
                            <Text size="xs" c={publicReplyEnabled ? 'green' : 'dimmed'}>
                                {t('tripDetails.chat.replyPublicly' as any) || 'Reply Publicly'}
                            </Text>
                            <Switch
                                size="xs"
                                checked={publicReplyEnabled}
                                onChange={(e) => onPublicReplyToggle?.(e.currentTarget.checked)}
                                color="green"
                            />
                        </Group>
                    )}
                    <form onSubmit={(e) => { e.preventDefault(); handleSend(); }}>
                        <Group gap="xs">
                            <TextInput
                                placeholder={t('tripDetails.chat.placeholder' as any)}
                                style={{ flex: 1 }}
                                value={inputValue}
                                onChange={(e) => setInputValue(e.currentTarget.value)}
                                disabled={sending}
                                radius="xl"
                            />
                            <ActionIcon
                                variant="filled"
                                color={publicReplyEnabled ? 'green' : 'blue'}
                                radius="xl"
                                size="lg"
                                type="submit"
                                loading={sending}
                                disabled={!inputValue.trim()}
                            >
                                <IconSend size={18} />
                            </ActionIcon>
                        </Group>
                    </form>
                </Paper>
            )}
        </Stack>
    );
}
