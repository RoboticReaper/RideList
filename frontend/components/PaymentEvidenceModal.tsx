'use client';

import { Modal, Stack, Text, TextInput, Button, Image, FileInput, Group } from '@mantine/core';
import { IconUpload, IconPhoto } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useState, useCallback } from 'react';

interface PaymentEvidenceModalProps {
    opened: boolean;
    onClose: () => void;
    onSubmit: (evidenceImage: string, evidenceText: string) => Promise<void>;
    loading?: boolean;
}

export function PaymentEvidenceModal({ opened, onClose, onSubmit, loading }: PaymentEvidenceModalProps) {
    const { t } = useTranslation('common');
    const [evidenceImage, setEvidenceImage] = useState<string | null>(null);
    const [evidenceText, setEvidenceText] = useState('');
    const [imageError, setImageError] = useState<string | null>(null);

    const handleFileChange = useCallback((file: File | null) => {
        setImageError(null);
        if (!file) {
            setEvidenceImage(null);
            return;
        }

        // Validate file type
        if (!file.type.startsWith('image/')) {
            setImageError(t('paymentEvidence.errors.invalidImage' as any) || 'Please upload an image file');
            return;
        }

        // Validate file size (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
            setImageError(t('paymentEvidence.errors.imageTooLarge' as any) || 'Image must be under 10MB');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            setEvidenceImage(e.target?.result as string);
        };
        reader.readAsDataURL(file);
    }, [t]);

    const handleSubmit = async () => {
        if (!evidenceImage || !evidenceText.trim()) return;
        await onSubmit(evidenceImage, evidenceText.trim());
        // Reset state after successful submission
        setEvidenceImage(null);
        setEvidenceText('');
    };

    const handleClose = () => {
        setEvidenceImage(null);
        setEvidenceText('');
        setImageError(null);
        onClose();
    };

    const isValid = !!evidenceImage && evidenceText.trim().length > 0;

    return (
        <Modal
            opened={opened}
            onClose={handleClose}
            title={t('paymentEvidence.title' as any) || 'Payment Evidence'}
            centered
            size="md"
        >
            <Stack gap="md">
                <Text size="sm" c="dimmed">
                    {t('paymentEvidence.description' as any) || 'Please upload a screenshot of your payment receipt and enter your payment username/handle for the driver to verify.'}
                </Text>

                {/* Image Upload */}
                <FileInput
                    label={t('paymentEvidence.screenshotLabel' as any) || 'Payment Screenshot'}
                    placeholder={t('paymentEvidence.screenshotPlaceholder' as any) || 'Click to upload receipt screenshot'}
                    accept="image/*"
                    leftSection={<IconPhoto size={16} />}
                    onChange={handleFileChange}
                    required
                    error={imageError}
                />

                {/* Image Preview */}
                {evidenceImage && (
                    <Image
                        src={evidenceImage}
                        alt="Payment evidence"
                        mah={200}
                        fit="contain"
                        radius="sm"
                    />
                )}

                {/* Handle / Username */}
                <TextInput
                    label={t('paymentEvidence.handleLabel' as any) || 'Payer Username / Handle'}
                    placeholder={t('paymentEvidence.handlePlaceholder' as any) || 'Your username on the payment platform'}
                    value={evidenceText}
                    onChange={(e) => setEvidenceText(e.currentTarget.value)}
                    required
                />

                <Group justify="flex-end" mt="xs">
                    <Button variant="default" onClick={handleClose} disabled={loading}>
                        {t('common.cancel')}
                    </Button>
                    <Button
                        color="orange"
                        onClick={handleSubmit}
                        loading={loading}
                        disabled={!isValid}
                        leftSection={<IconUpload size={16} />}
                    >
                        {t('paymentEvidence.submitBtn' as any) || 'Submit Payment'}
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
}
