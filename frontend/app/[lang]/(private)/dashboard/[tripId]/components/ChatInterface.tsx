'use client';

import { useState, useRef, useEffect } from 'react';
import { Stack, Group, Textarea, ActionIcon, Text, Paper, ScrollArea, Avatar, Box, LoadingOverlay, Switch, Modal, Button } from '@mantine/core';
import { IconSend, IconArrowLeft, IconWorld, IconTrash } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import dayjs from '@/utils/dateUtils';

interface Message {
    id: string;
    content: string;
    sender_id: string; // 'driver' messages are from current user if viewing as driver
    created_at: string;
    is_me: boolean;
    message_type?: string;
    original_question?: string;
    parent_message_id?: string | null;
}

interface ChatInterfaceProps {
    messages: Message[];
    onSend?: (content: string) => Promise<void>;
    onDelete?: (messageId: string) => Promise<void>;
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
    messages, onSend, onDelete, recipientName, recipientPhotoUrl, onBack, loading, sending,
    showPublicToggle, publicReplyEnabled, onPublicReplyToggle
}: ChatInterfaceProps) {
    const { t } = useTranslation('common');
    const [inputValue, setInputValue] = useState('');
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);
    const viewport = useRef<HTMLDivElement>(null);
    const prevLastMessageId = useRef<string | null>(null);

    const scrollToBottom = () => {
        if (viewport.current) {
            viewport.current.scrollTo({ top: viewport.current.scrollHeight, behavior: 'smooth' });
        }
    };

    // Only scroll when messages actually change (new message added)
    useEffect(() => {
        const lastMessageId = messages.length > 0 ? messages[messages.length - 1].id : null;

        // Scroll if: loading finished, or last message ID changed (new message)
        if (prevLastMessageId.current !== lastMessageId) {
            scrollToBottom();
            prevLastMessageId.current = lastMessageId;
        }
    }, [messages, loading]);

    const handleSend = async () => {
        if (!inputValue.trim() || !onSend) return;
        const temp = inputValue;
        setInputValue(''); // Optimistic clear
        await onSend(temp);
        scrollToBottom();
    };

    const openDeleteModal = (messageId: string) => {
        setDeletingMessageId(messageId);
        setDeleteModalOpen(true);
    };

    const handleDelete = async () => {
        if (!deletingMessageId || !onDelete) return;
        setDeleting(true);
        try {
            await onDelete(deletingMessageId);
            setDeleteModalOpen(false);
            setDeletingMessageId(null);
        } finally {
            setDeleting(false);
        }
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
                                {t('tripDetails.chat.noMessages')}
                            </Text>
                        )}
                        {messages.map((msg) => (
                            <Stack key={msg.id} gap={2}>
                                <Group
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
                                                    {t('tripDetails.chat.originalQuestion') || 'Original Question'}
                                                </Text>
                                                <Text size="xs" style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{msg.original_question}</Text>
                                            </Paper>
                                        )}
                                        <Text size="sm" style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{msg.content}</Text>
                                    </Paper>
                                    {/* Delete button for own messages (but not root messages of conversations) */}
                                    {msg.is_me && onDelete && !((msg.message_type === 'dm_private' || msg.message_type === 'question') && !msg.parent_message_id) && (
                                        <ActionIcon
                                            variant="subtle"
                                            color="gray"
                                            size="sm"
                                            onClick={() => openDeleteModal(msg.id)}
                                        >
                                            <IconTrash size={14} />
                                        </ActionIcon>
                                    )}
                                </Group>
                                {/* Timestamp */}
                                <Text
                                    size="xs"
                                    c="dimmed"
                                    ta={msg.is_me ? 'right' : 'left'}
                                    px={msg.is_me ? 0 : 32}
                                >
                                    {dayjs(msg.created_at).format('MMM D, h:mm A')}
                                </Text>
                            </Stack>
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
                                {t('tripDetails.chat.replyPublicly') || 'Reply Publicly'}
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
                            <Textarea
                                placeholder={t('tripDetails.chat.placeholder')}
                                style={{ flex: 1 }}
                                value={inputValue}
                                onChange={(e) => setInputValue(e.currentTarget.value)}
                                disabled={sending}
                                radius="xl"
                                minRows={1}
                                autosize
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

            {/* Delete Confirmation Modal */}
            <Modal
                opened={deleteModalOpen}
                onClose={() => setDeleteModalOpen(false)}
                title={t('tripDetails.chat.deleteMessage') || 'Delete Message'}
                centered
                zIndex={1000}
                size="sm"
            >
                <Text size="sm" mb="lg">
                    {t('tripDetails.chat.deleteConfirmation') || 'Are you sure you want to delete this message? This action cannot be undone.'}
                </Text>
                <Group justify="flex-end">
                    <Button variant="subtle" onClick={() => setDeleteModalOpen(false)}>
                        {t('common.cancel') || 'Cancel'}
                    </Button>
                    <Button color="red" onClick={handleDelete} loading={deleting}>
                        {t('common.delete') || 'Delete'}
                    </Button>
                </Group>
            </Modal>
        </Stack>
    );
}
