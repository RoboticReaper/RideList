import { useState, useEffect } from 'react';
import { Modal, Stack, Text, Textarea, Group, Button, Anchor } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/LocalizedLink';
import { IconExternalLink } from '@tabler/icons-react';

interface EditDriverNoteModalProps {
    opened: boolean;
    onClose: () => void;
    riderName: string;
    riderId: string;
    initialNote: string;
    onSave: (note: string) => void;
    loading: boolean;
}

export function EditDriverNoteModal({ opened, onClose, riderName, riderId, initialNote, onSave, loading }: EditDriverNoteModalProps) {
    const { t } = useTranslation('common');
    const [note, setNote] = useState(initialNote);

    useEffect(() => {
        setNote(initialNote || '');
    }, [initialNote, opened]);

    return (
        <Modal opened={opened} onClose={onClose} title={`Note for ${riderName}`}>
            <Stack>
                <Text size="sm" c="dimmed">
                    {t('tripDetails.manage.modals.editNote.privateReminder', 'This note is private and only visible to you.')}
                </Text>

                <Group>
                    <Button
                        component={LocalizedLink}
                        href={`/profile/${riderId}`}
                        target="_blank"
                        variant="default"
                        size="xs"
                        leftSection={<IconExternalLink size={14} />}
                    >
                        {t('tripDetails.manage.modals.editNote.viewProfile', 'View Profile')}
                    </Button>
                </Group>

                <Textarea
                    label={t('tripDetails.manage.modals.editNote.label', 'Private Note')}
                    placeholder={t('tripDetails.manage.modals.editNote.placeholder', 'Add a private note regarding this rider...')}
                    value={note}
                    onChange={(e) => setNote(e.currentTarget.value)}
                    minRows={3}
                />

                <Group justify="flex-end" mt="md">
                    <Button variant="default" onClick={onClose} disabled={loading}>{t('common.cancel')}</Button>
                    <Button
                        onClick={() => onSave(note)}
                        loading={loading}
                    >
                        {t('common.save')}
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
}
