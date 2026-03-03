'use client';
import { useState, useEffect } from 'react';
import { Button, TextInput, NumberInput, Switch, Textarea, Group, Select, TagsInput, Stack, Paper, Title, Divider, Modal, Text, FileButton, Image, ActionIcon, SimpleGrid } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useRouter } from 'next/navigation';
import { IconDeviceFloppy, IconTrash, IconUpload } from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import { useAuth } from '@/components/firebase/AuthContext';
import { useTranslation } from 'react-i18next';
import { compressImage } from '@/utils/compressImage';

import { parseFlexibilityNullable, parsePayWindowNullable, parseCutoffTimeNullable, parseStartCheckInNullable } from '@/utils/intervalParsers';

interface RuleTemplateFormProps {
    templateId?: string; // 'new' or uuid
    initialData?: any;
}

export function RuleTemplateForm({ templateId, initialData }: RuleTemplateFormProps) {
    const { t } = useTranslation('common');
    const { user } = useAuth();
    const router = useRouter();
    const isNew = templateId === 'new';

    console.log(initialData)


    const [name, setName] = useState(initialData?.name || '');
    const [autoAccept, setAutoAccept] = useState(initialData?.auto_accept ?? true);
    // Parse flexibility (interval object)
    // Use Nullable parser. If 0 (exact time), it returns 0. If null/empty, returns null.
    // Ensure 0 is preserved as 0, but null becomes '' for the input.
    const [flexibility, setFlexibility] = useState<number | ''>(parseFlexibilityNullable(initialData?.departure_time_flexibility) ?? '');
    const [pickupRadius, setPickupRadius] = useState<number | ''>(initialData?.pickup_radius_meters ?? '');
    const [dropoffRadius, setDropoffRadius] = useState<number | ''>(initialData?.drop_off_radius_meters ?? '');
    const [pickupRules, setPickupRules] = useState(initialData?.pickup_rules || '');
    const [cancellationPolicy, setCancellationPolicy] = useState(initialData?.cancellation_policy || '');
    const [paymentMethods, setPaymentMethods] = useState<string[]>(initialData?.payment_methods || []);
    const [paymentHandle, setPaymentHandle] = useState(initialData?.payment_handle || '');
    const [bigLuggage, setBigLuggage] = useState<number | ''>(initialData?.big_luggage_lim ?? '');
    const [smallLuggage, setSmallLuggage] = useState<number | ''>(initialData?.small_luggage_lim ?? '');
    const [bigLuggagePaid, setBigLuggagePaid] = useState<number | ''>(initialData?.big_luggage_paid ?? '');
    const [smallLuggagePaid, setSmallLuggagePaid] = useState<number | ''>(initialData?.small_luggage_paid ?? '');
    const [bigLuggagePaidPrice, setBigLuggagePaidPrice] = useState<number | ''>(initialData?.big_luggage_paid_price ?? '');
    const [smallLuggagePaidPrice, setSmallLuggagePaidPrice] = useState<number | ''>(initialData?.small_luggage_paid_price ?? '');

    // Parse cutoff
    const [cutoffEnabled, setCutoffEnabled] = useState(!!initialData?.cutoff_time);
    const [cutoffHours, setCutoffHours] = useState<number | ''>(
        parseCutoffTimeNullable(initialData?.cutoff_time) ?? ''
    );

    const [payWindow, setPayWindow] = useState<number | ''>(
        parsePayWindowNullable(initialData?.pay_window) ?? ''
    );

    const [startCheckInHrs, setStartCheckInHrs] = useState<number | ''>(
        parseStartCheckInNullable(initialData?.start_check_in_hrs_before_departure) ?? ''
    );

    const [opened, { open, close }] = useDisclosure(false);
    const [loading, setLoading] = useState(false);

    // Payment QR codes state
    const [paymentQRCodes, setPaymentQRCodes] = useState<Record<string, string>>(
        initialData?.payment_qr_codes || {}
    );

    // QR Code helpers
    const handleQRCodeUpload = async (file: File | null, paymentMethod: string) => {
        if (!file) return;
        try {
            const compressedBase64 = await compressImage(file);
            setPaymentQRCodes(prev => ({ ...prev, [paymentMethod]: compressedBase64 }));
        } catch (error) {
            console.error('QR code compression failed:', error);
            notifications.show({
                title: t('rides.errors.qrUploadErrorTitle'),
                message: t('rides.errors.qrUploadError'),
                color: 'red'
            });
        }
    };

    const removeQRCode = (paymentMethod: string) => {
        setPaymentQRCodes(prev => {
            const updated = { ...prev };
            delete updated[paymentMethod];
            return updated;
        });
    };

    const handleSubmit = async () => {
        if (!name.trim()) {
            notifications.show({ title: t('rides.errors.errorTitle'), message: t('templates.rules.form.notifications.nameRequired'), color: 'red' });
            return;
        }

        setLoading(true);
        try {
            const token = await user?.getIdToken();
            const payload = {
                name,
                auto_accept: autoAccept,
                departure_time_flexibility: (flexibility !== '' && flexibility !== undefined) ? `${flexibility} hours` : null,
                pickup_radius_meters: pickupRadius === '' ? null : pickupRadius,
                drop_off_radius_meters: dropoffRadius === '' ? null : dropoffRadius,
                pickup_rules: pickupRules || null,
                cancellation_policy: cancellationPolicy || null,
                payment_methods: paymentMethods && paymentMethods.length > 0 ? paymentMethods : null,
                payment_handle: paymentHandle || null,
                big_luggage_lim: bigLuggage === '' ? null : bigLuggage,
                small_luggage_lim: smallLuggage === '' ? null : smallLuggage,
                big_luggage_paid: bigLuggagePaid === '' ? null : bigLuggagePaid,
                small_luggage_paid: smallLuggagePaid === '' ? null : smallLuggagePaid,
                big_luggage_paid_price: bigLuggagePaidPrice === '' ? null : bigLuggagePaidPrice,
                small_luggage_paid_price: smallLuggagePaidPrice === '' ? null : smallLuggagePaidPrice,
                cutoff_time: (cutoffEnabled && cutoffHours !== '') ? `${cutoffHours} hours` : null,
                pay_window: (payWindow !== '' && payWindow !== undefined) ? `${payWindow} minutes` : null,
                start_check_in_hrs_before_departure: (startCheckInHrs !== '' && startCheckInHrs !== undefined) ? `${startCheckInHrs} hours` : null,
                payment_qr_codes: paymentQRCodes
            };

            console.log(payload);

            const url = isNew ? '/api/user/rule-templates' : `/api/user/rule-templates/${templateId}`;
            const method = isNew ? 'POST' : 'PUT';

            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error('Failed to save template');

            notifications.show({ title: t('rides.errors.successTitle'), message: t('templates.rules.form.notifications.saveSuccess'), color: 'green' });
            router.push('/rule-templates');

        } catch (error) {
            console.error(error);
            notifications.show({ title: t('rides.errors.errorTitle'), message: t('templates.rules.form.notifications.saveError'), color: 'red' });
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        setLoading(true);
        try {
            const token = await user?.getIdToken();
            const res = await fetch(`/api/user/rule-templates/${templateId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to delete template');
            }

            router.push('/rule-templates');
        } catch (error: any) {
            console.error(error);
            notifications.show({ title: t('rides.errors.errorTitle'), message: t('templates.rules.form.notifications.deleteError'), color: 'red' });
            setLoading(false);
            close();
        }
    };

    return (
        <Stack gap="md" maw={800} mx="auto">
            <Group justify="space-between">
                <Title order={3}>{isNew ? t('templates.rules.form.addTitle') : t('templates.rules.form.editTitle')}</Title>
                {!isNew && (
                    <Button color="red" variant="subtle" leftSection={<IconTrash size={16} />} onClick={open} loading={loading}>
                        {t('templates.rules.form.delete')}
                    </Button>
                )}
            </Group>

            <TextInput
                label={t('templates.rules.form.name')}
                placeholder={t('templates.rules.form.namePlaceholder')}
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
            />

            <Paper withBorder p="md" radius="md">
                <Title order={4} mb="md">{t('templates.rules.form.sectionRules')}</Title>
                <Stack>
                    <Group grow>
                        <NumberInput label={t('templates.rules.form.bigLuggage')} value={bigLuggage} onChange={(val) => setBigLuggage(val === '' ? '' : Number(val))} min={0} />
                        <NumberInput label={t('templates.rules.form.smallLuggage')} value={smallLuggage} onChange={(val) => setSmallLuggage(val === '' ? '' : Number(val))} min={0} />
                    </Group>

                    <Group grow>
                        <NumberInput label={t('templates.rules.form.paidBigLuggage')} value={bigLuggagePaid} onChange={(val) => setBigLuggagePaid(val === '' ? '' : Number(val))} min={0} />
                        <NumberInput label={t('templates.rules.form.paidSmallLuggage')} value={smallLuggagePaid} onChange={(val) => setSmallLuggagePaid(val === '' ? '' : Number(val))} min={0} />
                    </Group>

                    <Group grow>
                        <NumberInput label={t('templates.rules.form.paidBigLuggagePrice')} value={bigLuggagePaidPrice} onChange={(val) => setBigLuggagePaidPrice(val === '' ? '' : Number(val))} min={0} disabled={!bigLuggagePaid || bigLuggagePaid === 0} />
                        <NumberInput label={t('templates.rules.form.paidSmallLuggagePrice')} value={smallLuggagePaidPrice} onChange={(val) => setSmallLuggagePaidPrice(val === '' ? '' : Number(val))} min={0} disabled={!smallLuggagePaid || smallLuggagePaid === 0} />
                    </Group>

                    <NumberInput
                        label={t('templates.rules.form.flexibility')}
                        value={flexibility}
                        onChange={(val) => setFlexibility(val === '' ? '' : Number(val))}
                    />

                    <Switch
                        label={t('templates.rules.form.autoAccept')}
                        description={t('templates.rules.form.autoAcceptDesc')}
                        checked={autoAccept}
                        onChange={(e) => setAutoAccept(e.currentTarget.checked)}
                    />

                    <NumberInput
                        label={t('templates.rules.form.payWindow')}
                        description={t('templates.rules.form.payWindowDesc')}
                        value={payWindow}
                        onChange={(val) => setPayWindow(val === '' ? '' : Number(val))}
                    />

                    <Divider />

                    <TextInput label={t('templates.rules.form.pickupRules')} placeholder={t('templates.rules.form.pickupRulesPlaceholder')} value={pickupRules} onChange={(e) => setPickupRules(e.target.value)} />
                    <TextInput label={t('templates.rules.form.cancellationPolicy')} placeholder={t('templates.rules.form.cancellationPolicyPlaceholder')} value={cancellationPolicy} onChange={(e) => setCancellationPolicy(e.target.value)} />

                    <Group grow>
                        <NumberInput label={t('templates.rules.form.pickupRadius')} value={pickupRadius} onChange={(val) => setPickupRadius(val === '' ? '' : Number(val))} />
                        <NumberInput label={t('templates.rules.form.dropoffRadius')} value={dropoffRadius} onChange={(val) => setDropoffRadius(val === '' ? '' : Number(val))} />
                    </Group>

                    <Divider />

                    <Switch
                        label={t('templates.rules.form.cutoff')}
                        checked={cutoffEnabled}
                        onChange={(e) => setCutoffEnabled(e.currentTarget.checked)}
                    />
                    {cutoffEnabled && (
                        <NumberInput
                            label={t('templates.rules.form.cutoffHrs')}
                            value={cutoffHours}
                            onChange={(val) => setCutoffHours(val === '' ? '' : Number(val))}
                            min={1}
                        />
                    )}

                    <Divider />

                    <Switch
                        label={t('templates.rules.form.autoStartCheckIn')}
                        description={t('templates.rules.form.autoStartCheckInDesc')}
                        checked={startCheckInHrs !== ''}
                        onChange={(e) => setStartCheckInHrs(e.currentTarget.checked ? 3 : '')}
                    />
                    {startCheckInHrs !== '' && (
                        <NumberInput
                            label={t('templates.rules.form.cutoffHrs')}
                            placeholder={`${t('common.eg')} 3`}
                            value={startCheckInHrs}
                            onChange={(val) => setStartCheckInHrs(val === '' ? '' : Number(val))}
                            min={1}
                            mt="xs"
                        />
                    )}

                    <TagsInput
                        label={t('templates.rules.form.paymentMethods')}
                        data={['Cash', 'Venmo', 'Zelle', 'WeChat', 'Alipay (支付宝)', 'PayPal', 'CashApp']}
                        value={paymentMethods}
                        onChange={setPaymentMethods}
                        clearable
                        placeholder={t('common.selectOrType')}
                    />
                    <TextInput label={t('templates.rules.form.paymentHandle')} placeholder={t('templates.rules.form.paymentHandlePlaceholder')} value={paymentHandle} onChange={(e) => setPaymentHandle(e.target.value)} />

                    {/* Payment QR Codes */}
                    {paymentMethods && paymentMethods.length > 0 && (
                        <Stack gap="xs">
                            <Text size="sm" fw={500}>
                                {t('rides.create.labels.paymentQRCodes')}
                            </Text>
                            <Text size="xs" c="dimmed">
                                {t('rides.create.labels.paymentQRCodesDesc')}
                            </Text>
                            <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
                                {paymentMethods.map((method: string) => (
                                    <Paper key={method} p="sm" withBorder radius="md">
                                        <Stack gap="xs">
                                            <Group justify="space-between">
                                                <Text size="sm" fw={500}>{method}</Text>
                                                {paymentQRCodes[method] && (
                                                    <ActionIcon
                                                        variant="subtle"
                                                        color="red"
                                                        size="sm"
                                                        onClick={() => removeQRCode(method)}
                                                        title={t('rides.create.labels.removeQRCode') as string}
                                                    >
                                                        <IconTrash size={14} />
                                                    </ActionIcon>
                                                )}
                                            </Group>
                                            {paymentQRCodes[method] ? (
                                                <Image
                                                    src={paymentQRCodes[method]}
                                                    alt={`${method} QR Code`}
                                                    h={120}
                                                    w="auto"
                                                    fit="contain"
                                                    radius="sm"
                                                />
                                            ) : (
                                                <FileButton
                                                    onChange={(file) => handleQRCodeUpload(file, method)}
                                                    accept="image/*"
                                                >
                                                    {(props) => (
                                                        <Button
                                                            {...props}
                                                            variant="light"
                                                            leftSection={<IconUpload size={14} />}
                                                            size="xs"
                                                        >
                                                            {t('rides.create.labels.uploadQRCode')}
                                                        </Button>
                                                    )}
                                                </FileButton>
                                            )}
                                        </Stack>
                                    </Paper>
                                ))}
                            </SimpleGrid>
                        </Stack>
                    )}

                </Stack>
            </Paper>

            <Button leftSection={<IconDeviceFloppy size={16} />} onClick={handleSubmit} loading={loading}>
                {t('templates.rules.form.save')}
            </Button>

            <Modal opened={opened} onClose={close} title={t('templates.rules.form.modals.deleteTitle')} centered>
                <Text size="sm" mb="lg">
                    {t('templates.rules.form.modals.deleteMessage')}
                </Text>
                <Group justify="flex-end">
                    <Button variant="default" onClick={close}>{t('templates.rules.form.cancel')}</Button>
                    <Button color="red" onClick={handleDelete} loading={loading}>{t('templates.rules.form.modals.confirmDelete')}</Button>
                </Group>
            </Modal>
        </Stack>
    );
}
