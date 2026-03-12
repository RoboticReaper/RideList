'use client';

import { useState, useRef, useEffect } from 'react';
import { Stack, Group, Textarea, ActionIcon, Text, Paper, ScrollArea, Avatar, Box, LoadingOverlay, Switch, Modal, Button, FileButton, Image, CloseButton, Alert, Anchor } from '@mantine/core';
import { IconSend, IconArrowLeft, IconWorld, IconTrash, IconPhoto, IconArrowBackUp, IconArrowBack, IconArrowNarrowUp, IconInfoCircle } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import dayjs from '@/utils/dateUtils';
import { compressImage } from '@/utils/compressImage';

const URL_REGEX = /(https?:\/\/[^\s]+)/g;

function renderMessageContent(content: string) {
    if (!content) return null;
    const parts = content.split(URL_REGEX);
    return parts.map((part, i) => {
        if (part.match(URL_REGEX)) {
            return (
                <Anchor href={part} rel="noopener noreferrer" key={i} underline="always" inherit c="inherit">
                    {part}
                </Anchor>
            );
        }
        return part;
    });
}

interface Message {
    id: string;
    content: string;
    sender_id: string; // 'driver' messages are from current user if viewing as driver
    created_at: string;
    is_me: boolean;
    message_type?: string;
    content_type?: string;
    original_question?: string;
    parent_message_id?: string | null;
    is_global_dm?: boolean;
}

interface ChatInterfaceProps {
    messages: Message[];
    onSend?: (content: string, replyToMessageId?: string, imageData?: string) => Promise<void>;
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
    disableSend?: boolean;
    permissionNotice?: string;
}

export function ChatInterface({
    messages, onSend, onDelete, recipientName, recipientPhotoUrl, onBack, loading, sending,
    showPublicToggle, publicReplyEnabled, onPublicReplyToggle,
    disableSend, permissionNotice
}: ChatInterfaceProps) {
    const { t } = useTranslation('common');
    const [inputValue, setInputValue] = useState('');
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [replyToMessageId, setReplyToMessageId] = useState<string | null>(null);
    const [attachedImage, setAttachedImage] = useState<string | null>(null);
    const resetFileRef = useRef<() => void>(null);
    const viewport = useRef<HTMLDivElement>(null);
    const prevLastMessageId = useRef<string | null>(null);

    useEffect(() => {
        // Prevent background scrolling when chat interface is mounted
        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        return () => {
            document.body.style.overflow = originalOverflow;
        };
    }, []);

    const scrollToBottom = (instant = false) => {
        if (viewport.current) {
            viewport.current.scrollTo({ top: viewport.current.scrollHeight, behavior: instant ? 'auto' : 'smooth' });
        }
    };

    // Scroll logic
    useEffect(() => {
        const lastMessageId = messages.length > 0 ? messages[messages.length - 1].id : null;

        if (prevLastMessageId.current === null && lastMessageId !== null) {
            // First time receiving messages: jump instantly
            setTimeout(() => scrollToBottom(true), 10);
            setTimeout(() => scrollToBottom(true), 150); // Fallback after components render
        } else if (prevLastMessageId.current !== lastMessageId && lastMessageId !== null) {
            // New message appended: smooth scroll
            setTimeout(() => scrollToBottom(false), 50);
        }

        prevLastMessageId.current = lastMessageId;
    }, [messages]);

    // Additionally scroll instantly when loading finishes
    useEffect(() => {
        if (!loading && messages.length > 0) {
            setTimeout(() => scrollToBottom(true), 50);
        }
    }, [loading]);

    const handleFileChange = async (file: File | null) => {
        if (!file) return;
        if (!file.type.startsWith('image/')) return;
        if (file.size > 10 * 1024 * 1024) return; // 10MB limit

        try {
            const compressedBase64 = await compressImage(file);
            setAttachedImage(compressedBase64);
        } catch (error) {
            console.error('Image compression failed:', error);
        }
    };

    const handleSend = async () => {
        if ((!inputValue.trim() && !attachedImage) || !onSend || disableSend) return;
        const temp = inputValue.trim();
        const replyTo = replyToMessageId;
        const img = attachedImage;
        setInputValue(''); // Optimistic clear
        setReplyToMessageId(null);
        setAttachedImage(null);
        resetFileRef.current?.();
        await onSend(temp, replyTo ?? undefined, img ?? undefined);

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
        <Stack h="100%" gap={0} bg="gray.0" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 200 }}>
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
                                                <Text size="xs" style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{renderMessageContent(msg.original_question)}</Text>
                                            </Paper>
                                        )}
                                        {/* Show replied-to message if we have parent_message_id and can find it (global DM only) */}
                                        {msg.is_global_dm && msg.parent_message_id && messages.some(m => m.id === msg.parent_message_id) && (
                                            <Paper p="xs" mb="xs" bg={msg.is_me ? 'blue.7' : 'gray.3'} radius="sm" style={{ borderLeft: '3px solid rgba(0,0,0,0.2)' }}>
                                                <Text size="xs" fw={600} c={msg.is_me ? 'rgba(255,255,255,0.9)' : 'dark.4'} mb={2}>
                                                    {messages.find(m => m.id === msg.parent_message_id)?.is_me ? ((t as any)('tripDetails.chat.yourself') || 'You') : recipientName}
                                                </Text>
                                                <Box>
                                                    {(() => {
                                                        const pMsg = messages.find(m => m.id === msg.parent_message_id);
                                                        if (!pMsg) return <Text size="xs" c={msg.is_me ? 'rgba(255,255,255,0.8)' : 'dimmed'} truncate="end">Replied to a message</Text>;
                                                        if (pMsg.message_type === 'image' || pMsg.content_type === 'image') {
                                                            return <Image src={pMsg.content} mah={40} fit="contain" radius="sm" mt={2} />;
                                                        }
                                                        return <Text size="xs" c={msg.is_me ? 'rgba(255,255,255,0.8)' : 'dimmed'} truncate="end">{pMsg.content}</Text>;
                                                    })()}
                                                </Box>
                                            </Paper>
                                        )}

                                        {msg.message_type === 'image' || msg.content_type === 'image' ? (
                                            <Image
                                                src={msg.content}
                                                radius="sm"
                                                mah={250}
                                                fit="contain"
                                                mt={msg.original_question || msg.parent_message_id ? 'xs' : 0}
                                            />
                                        ) : (
                                            <Text size="sm" style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{renderMessageContent(msg.content)}</Text>
                                        )}
                                    </Paper>

                                    <Stack gap={0} align="center">
                                        {/* Reply button for DMs */}
                                        {msg.is_global_dm && onSend && (
                                            <ActionIcon
                                                variant="subtle"
                                                color="gray"
                                                size="sm"
                                                className="reply-btn hide-until-hover"
                                                onClick={() => setReplyToMessageId(msg.id)}
                                            >
                                                <IconArrowBackUp size={14} />
                                            </ActionIcon>
                                        )}
                                        {/* Delete button for own messages (but not root messages of conversations, unless it's global DM) */}
                                        {msg.is_me && onDelete && (msg.is_global_dm || !((msg.message_type === 'dm_private' || msg.message_type === 'question') && !msg.parent_message_id)) && (
                                            <ActionIcon
                                                variant="subtle"
                                                color="gray"
                                                size="sm"
                                                onClick={() => openDeleteModal(msg.id)}
                                            >
                                                <IconTrash size={14} />
                                            </ActionIcon>
                                        )}
                                    </Stack>
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
                    {permissionNotice && (
                        <Alert variant="light" color={disableSend ? 'orange' : 'blue'} icon={<IconInfoCircle size={16} />} mb="xs" py="xs" px="sm">
                            <Text size="xs">{permissionNotice}</Text>
                        </Alert>
                    )}
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
                    {replyToMessageId && (
                        <Paper p="xs" mb="xs" bg="gray.1" radius="sm" withBorder style={{ borderLeft: '3px solid var(--mantine-color-blue-5)' }}>
                            <Group justify="space-between" align="flex-start" wrap="nowrap">
                                <Box style={{ overflow: 'hidden' }}>
                                    <Group gap={4} mb={2}>
                                        <Text size="xs" fw={700} c="dimmed">Replying to</Text>
                                        <Text size="xs" fw={600} c="dark.7">
                                            {messages.find(m => m.id === replyToMessageId)?.is_me ? ((t as any)('tripDetails.chat.yourself') || 'You') : recipientName}
                                        </Text>
                                    </Group>
                                    <Box>
                                        {(() => {
                                            const rMsg = messages.find(m => m.id === replyToMessageId);
                                            if (!rMsg) return <Text size="xs" truncate="end" c="dark.7">message</Text>;
                                            if (rMsg.message_type === 'image' || rMsg.content_type === 'image') {
                                                return <Image src={rMsg.content} mah={60} fit="contain" radius="sm" mt={2} />;
                                            }
                                            return <Text size="xs" truncate="end" c="dark.7">{rMsg.content}</Text>;
                                        })()}
                                    </Box>
                                </Box>
                                <ActionIcon size="xs" variant="subtle" color="gray" onClick={() => setReplyToMessageId(null)}>
                                    <IconTrash size={12} />
                                </ActionIcon>
                            </Group>
                        </Paper>
                    )}
                    {attachedImage && (
                        <Paper p="xs" mb="xs" bg="gray.1" radius="sm" withBorder style={{ position: 'relative', display: 'inline-block' }}>
                            <CloseButton
                                size="sm"
                                style={{ position: 'absolute', top: 4, right: 4, zIndex: 2 }}
                                onClick={() => { setAttachedImage(null); resetFileRef.current?.(); }}
                            />
                            <Image src={attachedImage} mah={100} fit="contain" radius="sm" />
                        </Paper>
                    )}
                    <form onSubmit={(e) => { e.preventDefault(); handleSend(); }}>
                        <Group gap="xs" align="flex-end">
                            <FileButton resetRef={resetFileRef} onChange={handleFileChange} accept="image/*">
                                {(props) => (
                                    <ActionIcon variant="subtle" color="gray" size="lg" radius="xl" {...props} disabled={sending} mb={4}>
                                        <IconPhoto size={20} />
                                    </ActionIcon>
                                )}
                            </FileButton>
                            <Textarea
                                placeholder={attachedImage ? t('tripDetails.chat.addCaptionOptional') || 'Add a caption...' : t('tripDetails.chat.placeholder')}
                                style={{ flex: 1 }}
                                value={inputValue}
                                onChange={(e) => setInputValue(e.currentTarget.value)}
                                disabled={sending}
                                radius="xl"
                                minRows={1}
                                maxRows={4}
                                autosize
                            />
                            <ActionIcon
                                variant="filled"
                                color={publicReplyEnabled ? 'green' : 'blue'}
                                radius="xl"
                                size="lg"
                                type="submit"
                                loading={sending}
                                disabled={(!inputValue.trim() && !attachedImage) || disableSend}
                                mb={4}
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
