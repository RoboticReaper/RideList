'use client';
import { useState, useEffect } from 'react';
import { Button, TextInput, NumberInput, Switch, Textarea, Group, Select, TagsInput, Stack, Paper, Title, Divider, Modal, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useRouter } from 'next/navigation';
import { IconDeviceFloppy, IconTrash } from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import { useAuth } from '@/components/firebase/AuthContext';

import { parseFlexibilityNullable, parsePayWindowNullable, parseCutoffTimeNullable, parseStartCheckInNullable } from '@/utils/intervalParsers';

interface RuleTemplateFormProps {
    templateId?: string; // 'new' or uuid
    initialData?: any;
}

export function RuleTemplateForm({ templateId, initialData }: RuleTemplateFormProps) {
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

    const handleSubmit = async () => {
        if (!name.trim()) {
            notifications.show({ title: 'Error', message: 'Template name is required', color: 'red' });
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
                cutoff_time: (cutoffEnabled && cutoffHours !== '') ? `${cutoffHours} hours` : null,
                pay_window: (payWindow !== '' && payWindow !== undefined) ? `${payWindow} minutes` : null,
                start_check_in_hrs_before_departure: (startCheckInHrs !== '' && startCheckInHrs !== undefined) ? `${startCheckInHrs} hours` : null,
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

            notifications.show({ title: 'Success', message: 'Template saved successfully', color: 'green' });
            router.push('/rule-templates');

        } catch (error) {
            console.error(error);
            notifications.show({ title: 'Error', message: 'Failed to save template', color: 'red' });
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
            notifications.show({ title: 'Error', message: error.message, color: 'red' });
            setLoading(false);
            close();
        }
    };

    return (
        <Stack gap="md" maw={800} mx="auto">
            <Group justify="space-between">
                <Title order={3}>{isNew ? 'New Rule Template' : 'Edit Rule Template'}</Title>
                {!isNew && (
                    <Button color="red" variant="subtle" leftSection={<IconTrash size={16} />} onClick={open} loading={loading}>
                        Delete
                    </Button>
                )}
            </Group>

            <TextInput
                label="Template Name"
                placeholder="e.g. Standard Rules"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
            />

            <Paper withBorder p="md" radius="md">
                <Title order={4} mb="md">Rules & Logistics</Title>
                <Stack>
                    <Group grow>
                        <NumberInput label="Big Luggage Limit" value={bigLuggage} onChange={(val) => setBigLuggage(val === '' ? '' : Number(val))} min={0} />
                        <NumberInput label="Small Luggage Limit" value={smallLuggage} onChange={(val) => setSmallLuggage(val === '' ? '' : Number(val))} min={0} />
                    </Group>

                    <NumberInput
                        label="Departure Flexibility (Hours)"
                        value={flexibility}
                        onChange={(val) => setFlexibility(val === '' ? '' : Number(val))}
                    />

                    <Switch
                        label="Auto-accept Bookings"
                        description="Automatically confirm bookings that meet your criteria"
                        checked={autoAccept}
                        onChange={(e) => setAutoAccept(e.currentTarget.checked)}
                    />

                    <NumberInput
                        label="Pay Window (Minutes)"
                        description="Time for rider to pay after joining"
                        value={payWindow}
                        onChange={(val) => setPayWindow(val === '' ? '' : Number(val))}
                    />

                    <Divider />

                    <TextInput label="Pickup Rules" placeholder="e.g. Curb side only" value={pickupRules} onChange={(e) => setPickupRules(e.target.value)} />
                    <TextInput label="Cancellation Policy" placeholder="e.g. Free cancellation until 24h before" value={cancellationPolicy} onChange={(e) => setCancellationPolicy(e.target.value)} />

                    <Group grow>
                        <NumberInput label="Pickup Radius (meters)" value={pickupRadius} onChange={(val) => setPickupRadius(val === '' ? '' : Number(val))} />
                        <NumberInput label="Drop-off Radius (meters)" value={dropoffRadius} onChange={(val) => setDropoffRadius(val === '' ? '' : Number(val))} />
                    </Group>

                    <Divider />

                    <Switch
                        label="Booking Cutoff Time"
                        checked={cutoffEnabled}
                        onChange={(e) => setCutoffEnabled(e.currentTarget.checked)}
                    />
                    {cutoffEnabled && (
                        <NumberInput
                            label="Hours before departure"
                            value={cutoffHours}
                            onChange={(val) => setCutoffHours(val === '' ? '' : Number(val))}
                            min={1}
                        />
                    )}

                    <Divider />

                    <Switch
                        label="Auto-start Check-in"
                        description="Automatically enable check-in for this rule set"
                        checked={startCheckInHrs !== ''}
                        onChange={(e) => setStartCheckInHrs(e.currentTarget.checked ? 3 : '')}
                    />
                    {startCheckInHrs !== '' && (
                        <NumberInput
                            label="Hours before departure"
                            placeholder="e.g. 3"
                            value={startCheckInHrs}
                            onChange={(val) => setStartCheckInHrs(val === '' ? '' : Number(val))}
                            min={1}
                            mt="xs"
                        />
                    )}

                    <TagsInput
                        label="Payment Methods"
                        data={['Cash', 'Venmo', 'Zelle', 'WeChat', 'CashApp']}
                        value={paymentMethods}
                        onChange={setPaymentMethods}
                        clearable
                        placeholder="Select or type..."
                    />
                    <TextInput label="Payment Handle (optional)" placeholder="e.g. @username" value={paymentHandle} onChange={(e) => setPaymentHandle(e.target.value)} />

                </Stack>
            </Paper>

            <Button leftSection={<IconDeviceFloppy size={16} />} onClick={handleSubmit} loading={loading}>
                Save Template
            </Button>

            <Modal opened={opened} onClose={close} title="Confirm Deletion" centered>
                <Text size="sm" mb="lg">
                    Are you sure you want to delete this rule template? This action cannot be undone.
                </Text>
                <Group justify="flex-end">
                    <Button variant="default" onClick={close}>Cancel</Button>
                    <Button color="red" onClick={handleDelete} loading={loading}>Delete Template</Button>
                </Group>
            </Modal>
        </Stack>
    );
}
