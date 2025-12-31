'use client';
import { useState, useEffect } from 'react';
import { Button, TextInput, NumberInput, Switch, Textarea, Group, Select, TagsInput, Stack, Paper, Title, Divider } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useRouter } from 'next/navigation';
import { IconDeviceFloppy, IconTrash } from '@tabler/icons-react';
import { useAuth } from '@/components/firebase/AuthContext';

interface RuleTemplateFormProps {
    templateId?: string; // 'new' or uuid
    initialData?: any;
}

export function RuleTemplateForm({ templateId, initialData }: RuleTemplateFormProps) {
    const { user } = useAuth();
    const router = useRouter();
    const isNew = templateId === 'new';

    console.log(initialData)

    // Parse flexibility interval to hours (number)
    const parseIntervalToHours = (interval: any) => {
        if (!interval) return null;
        if (typeof interval === 'object') {
            const h = (interval.hours || 0) + (interval.minutes || 0) / 60 + (interval.seconds || 0) / 3600;
            return h > 0 ? h : null;
        }

        const p = parseFloat(String(interval));
        return isNaN(p) ? null : p;
    };

    // Parse pay window interval to minutes (number)
    const parsePayWindowToMinutes = (interval: any) => {
        if (!interval) return null;
        if (typeof interval === 'object') {
            const m = (interval.hours || 0) * 60 + (interval.minutes || 0) + (interval.seconds || 0) / 60;
            return m > 0 ? m : null;
        }

        const p = parseFloat(String(interval));
        return isNaN(p) ? 30 : p;
    };


    const [name, setName] = useState(initialData?.name || '');
    const [autoAccept, setAutoAccept] = useState(initialData?.auto_accept ?? true);
    // Parse flexibility (interval object)
    const [flexibility, setFlexibility] = useState<number | ''>(parseIntervalToHours(initialData?.departure_time_flexibility));
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
        parseIntervalToHours(initialData?.cutoff_time)
    );

    const [payWindow, setPayWindow] = useState<number | ''>(
        parsePayWindowToMinutes(initialData?.pay_window)
    );

    const [startCheckInHrs, setStartCheckInHrs] = useState<number | ''>(
        parseIntervalToHours(initialData?.start_check_in_hrs_before_departure)
    );

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
                pickup_rules: pickupRules,
                cancellation_policy: cancellationPolicy,
                payment_methods: paymentMethods,
                payment_handle: paymentHandle,
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
        if (confirm('Are you sure you want to delete this template?')) {
            setLoading(true);
            try {
                const token = await user?.getIdToken();
                await fetch(`/api/user/rule-templates/${templateId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                router.push('/rule-templates');
            } catch (error) {
                console.error(error);
                notifications.show({ title: 'Error', message: 'Failed to delete template', color: 'red' });
                setLoading(false);
            }
        }
    };

    return (
        <Stack gap="md" maw={800} mx="auto">
            <Group justify="space-between">
                <Title order={3}>{isNew ? 'New Rule Template' : 'Edit Rule Template'}</Title>
                {!isNew && (
                    <Button color="red" variant="subtle" leftSection={<IconTrash size={16} />} onClick={handleDelete} loading={loading}>
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

                    <NumberInput
                        label="Auto-start Check-in (Hours before departure)"
                        description="Leave empty if check-in is not required. Passengers can check in this many hours before departure."
                        value={startCheckInHrs}
                        onChange={(val) => setStartCheckInHrs(val === '' ? '' : Number(val))}
                    />

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
        </Stack>
    );
}
