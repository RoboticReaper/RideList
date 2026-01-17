'use client';

import { Modal, Text, Button, Stack, ThemeIcon, Group, UnstyledButton, Divider, Paper, Image } from '@mantine/core';
import { IconCheck, IconClock, IconBellRinging, IconCreditCard, IconQrcode } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useNotifications } from '@/components/Notifications/NotificationContext';
import { useState } from 'react';
import { parsePayWindow } from '@/utils/intervalParsers';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { useRouter } from 'next/navigation';

interface BookingSuccessModalProps {
    opened: boolean;
    onClose: () => void;
    status: string;
    payWindow: any; // Can be string, number, or PostgresInterval object
    paymentHandle?: string | null;
    paymentQRCode?: string | null;
    selectedPaymentMethod?: string;
}

export function BookingSuccessModal({ opened, onClose, status, payWindow, paymentHandle, paymentQRCode, selectedPaymentMethod }: BookingSuccessModalProps) {
    const { t } = useTranslation('common');
    const { pushPermission, showPrompt } = useNotifications();
    const { isIOS, isStandalone } = usePWAInstall();
    const router = useRouter();
    const [loadingPermission, setLoadingPermission] = useState(false);

    const handleEnablePush = async () => {
        setLoadingPermission(true);

        // iOS Safari: Redirect to PWA install first
        // User must install PWA before they can receive push notifications on iOS
        if (isIOS && !isStandalone) {
            onClose(); // Close the modal before redirecting
            router.push('/?pwa_ios_install=true');
            return;
        }

        // We use showPrompt({ force: true }) to trigger the global PushPermissionModal
        // This handles iOS install guides, Android upsells, and blocked state recovery
        showPrompt({ force: true });
        setLoadingPermission(false);
    };

    const isPayWindow = status === 'joined_with_pay_window';
    const isWaiting = status === 'waiting_approval';

    // Parse pay window into minutes
    const payWindowMins = parsePayWindow(payWindow);
    const payWindowText = `${t('rides.detail.time.minutes', { count: payWindowMins })}`;

    // If neither (failed or other status), don't show specific success UI, or fallback
    if (!isPayWindow && !isWaiting) return null;

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={t('rides.detail.bookingSuccess.title')} // "Booking Submitted"
            centered
            size="sm"
            withCloseButton={false}
            closeOnClickOutside={false}
        >
            <Stack align="center" gap="md" py="xs">
                {/* ICON & MAIN MESSAGE */}
                {isPayWindow ? (
                    <>
                        <ThemeIcon size={64} radius="xl" variant="light" color="blue">
                            <IconCreditCard size={32} />
                        </ThemeIcon>
                        <Text ta="center" size="lg" fw={700}>
                            {t('rides.detail.bookingSuccess.payNow')}
                        </Text>
                        <Text ta="center" c="dimmed" size="sm">
                            {t('rides.detail.bookingSuccess.payWindowMessage', { time: payWindowText })}
                        </Text>
                    </>
                ) : (
                    <>
                        <ThemeIcon size={64} radius="xl" variant="light" color="yellow">
                            <IconClock size={32} />
                        </ThemeIcon>
                        <Text ta="center" size="lg" fw={700}>
                            {t('rides.detail.bookingSuccess.waitingApproval')}
                        </Text>
                        <Text ta="center" c="dimmed" size="sm">
                            {t('rides.detail.bookingSuccess.waitingMessage')}
                        </Text>
                    </>
                )}

                {/* Payment Info Section (for pay window status) */}
                {isPayWindow && (paymentHandle || paymentQRCode) && (
                    <Paper withBorder p="sm" radius="md" w="100%" bg="gray.0">
                        {paymentHandle && (
                            <>
                                <Text size="xs" c="dimmed" mb={2}>{t('rides.detail.payment.handleLabel' as any)}</Text>
                                <Text size="sm" fw={500} mb={paymentQRCode ? 'sm' : 0}>{paymentHandle}</Text>
                            </>
                        )}
                        {paymentQRCode && selectedPaymentMethod && (
                            <>
                                {paymentHandle && <Divider my="xs" />}
                                <Text size="xs" c="dimmed" mb={4}>{selectedPaymentMethod} {t('rides.detail.payment.qrCodesLabel' as any)}</Text>
                                <Image
                                    src={paymentQRCode}
                                    alt={`${selectedPaymentMethod} QR Code`}
                                    w="100%"
                                    mah={200}
                                    fit="contain"
                                    radius="sm"
                                />
                            </>
                        )}
                    </Paper>
                )}

                {/* PUSH UPDATES UPSELL (Only if default) */}
                {pushPermission === 'default' && (
                    <div
                        onClick={loadingPermission ? undefined : handleEnablePush}
                        style={{ width: '100%', cursor: loadingPermission ? 'not-allowed' : 'pointer' }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleEnablePush();
                            }
                        }}
                    >
                        <Group align="start" p="sm" bg="gray.0" style={{ borderRadius: 8 }}>
                            <ThemeIcon variant="light" color="blue" size="md" radius="md">
                                <IconBellRinging size={18} />
                            </ThemeIcon>
                            <div style={{ flex: 1 }}>
                                <Text size="sm" fw={600}>
                                    {t('rides.detail.bookingSuccess.enablePushTitle')}
                                </Text>
                                <Text size="xs" c="dimmed" style={{ lineHeight: 1.3 }}>
                                    {t('rides.detail.bookingSuccess.enablePushMessage')}
                                </Text>
                            </div>
                            <Button size="xs" variant="white" loading={loadingPermission} style={{ pointerEvents: 'none' }}>
                                {t('rides.detail.bookingSuccess.enablePushBtn')}
                            </Button>
                        </Group>
                    </div>
                )}

                <Button fullWidth onClick={onClose} size="md" mt="xs">
                    {t('rides.detail.bookingSuccess.closeBtn')}
                </Button>
            </Stack>
        </Modal>
    );
}
