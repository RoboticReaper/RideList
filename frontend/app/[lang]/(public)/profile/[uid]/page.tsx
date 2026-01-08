'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Container, Paper, Avatar, Text, Group, Stack, Badge, Loader, Center, Title, Button, TextInput, ActionIcon, Box, Tabs, NumberInput, Divider } from '@mantine/core';
import { useAuth } from '@/components/firebase/AuthContext';
import { useTranslation } from 'react-i18next';
import { IconCheck, IconPhone, IconCalendar, IconPencil, IconX, IconDeviceFloppy, IconCar, IconSteeringWheel, IconCamera } from '@tabler/icons-react';

interface UserProfile {
    id: string;
    name: string;
    verified: boolean;
    created_at: string;
    phone: string | null;
    photo_url: string | null;
    phone_privacy: 'VISIBLE' | 'REDACTED' | 'MISSING';
    rider_profile: {
        default_big_luggage: number | null;
        default_small_luggage: number | null;
        rating: number | null;
        completed_rides: number;
    };
    driver_profile: {
        rating: number | null;
        completed_trips: number;
    };
}

export default function ProfilePage() {
    const { t, i18n } = useTranslation('common');
    const params = useParams();
    const uid = params.uid as string;
    const searchParams = useSearchParams();

    const { user } = useAuth();
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Tab state management
    const roleParam = searchParams.get('role');
    const [activeTab, setActiveTab] = useState<string | null>(
        roleParam === 'driver' ? 'driver' : 'rider'
    );

    const handleTabChange = (value: string | null) => {
        setActiveTab(value);
    };

    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState('');
    const [editPhone, setEditPhone] = useState('');
    const [editBigLuggage, setEditBigLuggage] = useState(0);
    const [editSmallLuggage, setEditSmallLuggage] = useState(0);
    const [nameError, setNameError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [pendingPhoto, setPendingPhoto] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const isOwner = user?.uid === uid;

    const startEditing = () => {
        if (profile) {
            setEditName(profile.name);
            setEditPhone(profile.phone || '');
            setEditBigLuggage(profile.rider_profile?.default_big_luggage || 0);
            setEditSmallLuggage(profile.rider_profile?.default_small_luggage || 0);
            setNameError(null);
            setPendingPhoto(null);
            setIsEditing(true);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setPendingPhoto(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const cancelEditing = () => {
        setIsEditing(false);
        setNameError(null);
    };

    const saveProfile = async () => {
        if (!user) return;

        if (!editName.trim()) {
            setNameError(t('profile.errors.nameRequired'));
            return;
        }

        setSaving(true);
        try {
            const token = await user.getIdToken();
            const res = await fetch(`/api/user/${uid}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: editName,
                    phone: editPhone,
                    profile_image_base64: pendingPhoto,
                    rider_config: {
                        default_big_luggage: editBigLuggage,
                        default_small_luggage: editSmallLuggage
                    }
                })
            });

            if (!res.ok) throw new Error("Failed to update profile");

            const updatedProfile = await res.json();
            setProfile(updatedProfile);
            setIsEditing(false);
        } catch (e) {
            console.error(e);
            alert(t('profile.errors.saveFailed'));
        } finally {
            setSaving(false);
        }
    };

    useEffect(() => {
        async function fetchProfile() {
            try {
                setLoading(true);
                const headers: HeadersInit = {};
                if (user) {
                    const token = await user.getIdToken();
                    headers['Authorization'] = `Bearer ${token}`;
                }

                const res = await fetch(`/api/user/${uid}`, { headers });
                if (!res.ok) {
                    if (res.status === 404) throw new Error(t('profile.errors.notFound'));
                    throw new Error(t('profile.errors.fetchFailed'));
                }
                const data = await res.json();
                setProfile(data);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }

        if (uid) {
            fetchProfile();
        }
    }, [uid, user]);

    if (loading) return <Center h={300}><Loader /></Center>;
    if (error) return <Center h={300}><Text c="red">{error}</Text></Center>;
    if (!profile) return null;

    return (
        <Container size="sm" py="xl">
            <Paper radius="md" withBorder p="lg" bg="var(--mantine-color-body)">
                <Group align="flex-start">
                    <Stack align="center" gap="xs">
                        <Avatar src={pendingPhoto || profile.photo_url} size={120} radius={120} />
                        {isEditing && (
                            <>
                                <Button
                                    size="xs"
                                    variant="light"
                                    leftSection={<IconCamera size={14} />}
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    {t('profile.changePhoto')}
                                </Button>
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    style={{ display: 'none' }}
                                    accept="image/*"
                                    onChange={handleFileChange}
                                />
                            </>
                        )}
                    </Stack>
                    <Stack gap="xs" style={{ flex: 1 }}>
                        <Group justify="space-between" align="start">
                            <Box style={{ flex: 1 }}>
                                {isEditing ? (
                                    <TextInput
                                        value={editName}
                                        onChange={(e) => {
                                            setEditName(e.target.value);
                                            if (e.target.value.trim()) setNameError(null);
                                        }}
                                        mb="xs"
                                        label="Name"
                                        error={nameError}
                                    />
                                ) : (
                                    <Group>
                                        <Title order={2}>{profile.name}</Title>
                                        {profile.verified && <Badge color="green" leftSection={<IconCheck size={12} />}>{t('profile.verifiedStudent')}</Badge>}
                                    </Group>
                                )}
                            </Box>

                            {isOwner && !isEditing && (
                                <ActionIcon variant="subtle" color="gray" onClick={startEditing}>
                                    <IconPencil size={20} />
                                </ActionIcon>
                            )}
                        </Group>

                        <Group gap="xs" c="dimmed" fz="sm">
                            <IconCalendar size={16} />
                            <Text>{t('profile.joined')} {new Date(profile.created_at).toLocaleDateString(i18n.language)}</Text>
                        </Group>

                        {isEditing ? (
                            <TextInput
                                value={editPhone}
                                onChange={(e) => setEditPhone(e.target.value)}
                                label={t('profile.phone')}
                                placeholder={t('profile.phonePlaceholder')}
                            />
                        ) : (
                            <>
                                {profile.phone_privacy === 'VISIBLE' && (
                                    <Group gap="xs">
                                        <IconPhone size={16} />
                                        <Text>{profile.phone}</Text>
                                    </Group>
                                )}

                                {profile.phone_privacy === 'REDACTED' && (
                                    <Group gap="xs" align="flex-start">
                                        <IconPhone size={16} color="var(--mantine-color-dimmed)" style={{ marginTop: 4 }} />
                                        <Text c="dimmed" size="sm" style={{ flex: 1 }}>
                                            {t('profile.phoneHidden')}
                                            <Text span size="xs" display="block" mt={4} c="dimmed">
                                                {t('profile.phoneHiddenDesc')}
                                            </Text>
                                        </Text>
                                    </Group>
                                )}

                                {profile.phone_privacy === 'MISSING' && (
                                    <Group gap="xs">
                                        <IconPhone size={16} color="var(--mantine-color-dimmed)" />
                                        <Text c="dimmed" size="sm" fs="italic">
                                            {t('profile.noPhone')}
                                        </Text>
                                    </Group>
                                )}
                            </>
                        )}

                        {isEditing && (
                            <Group mt="md">
                                <Button leftSection={<IconDeviceFloppy size={16} />} onClick={saveProfile} loading={saving}>{t('profile.save')}</Button>
                                <Button leftSection={<IconX size={16} />} variant="default" onClick={cancelEditing} disabled={saving}>{t('profile.cancel')}</Button>
                            </Group>
                        )}

                    </Stack>
                </Group>
            </Paper>

            <Paper radius="md" withBorder mt="md" bg="var(--mantine-color-body)">
                <Tabs value={activeTab} onChange={handleTabChange}>
                    <Tabs.List>
                        <Tabs.Tab value="rider" leftSection={<IconCar size={16} />}>{t('profile.riderProfile')}</Tabs.Tab>
                        <Tabs.Tab value="driver" leftSection={<IconSteeringWheel size={16} />}>{t('profile.driverProfile')}</Tabs.Tab>
                    </Tabs.List>

                    <Tabs.Panel value="rider" p="lg">
                        <Stack>
                            <Group grow>
                                <Paper withBorder p="xs" radius="sm">
                                    <Text size="xs" c="dimmed" tt="uppercase" fw={700}>{t('profile.ridesTaken')}</Text>
                                    <Text fw={700} size="xl">{profile.rider_profile.completed_rides}</Text>
                                </Paper>
                                <Paper withBorder p="xs" radius="sm">
                                    <Text size="xs" c="dimmed" tt="uppercase" fw={700}>{t('profile.rating')}</Text>
                                    <Text fw={700} size="xl">{profile.rider_profile.rating ? profile.rider_profile.rating.toFixed(1) : 'N/A'}</Text>
                                </Paper>
                            </Group>

                            {/* TODO: polish this feature */}
                            {/* {(profile.rider_profile.default_small_luggage !== null || isEditing) && (
                                <>
                                    <Divider label={t('profile.preferences')} labelPosition="center" />

                                    <Box>
                                        <Text c="dimmed" size="xs" ta="center" mb="sm">
                                            {t('profile.preferencesDesc')}
                                        </Text>
                                        <Group grow>
                                            <NumberInput
                                                label={t('profile.smallLuggage')}
                                                description={t('profile.smallLuggageDesc')}
                                                min={0}
                                                max={10}
                                                value={isEditing ? editSmallLuggage : (profile.rider_profile.default_small_luggage ?? 0)}
                                                onChange={(v) => setEditSmallLuggage(typeof v === 'number' ? v : 0)}
                                                readOnly={!isEditing}
                                                variant={isEditing ? 'default' : 'unstyled'}
                                            />
                                            <NumberInput
                                                label={t('profile.bigLuggage')}
                                                description={t('profile.bigLuggageDesc')}
                                                min={0}
                                                max={10}
                                                value={isEditing ? editBigLuggage : (profile.rider_profile.default_big_luggage ?? 0)}
                                                onChange={(v) => setEditBigLuggage(typeof v === 'number' ? v : 0)}
                                                readOnly={!isEditing}
                                                variant={isEditing ? 'default' : 'unstyled'}
                                            />
                                        </Group>
                                    </Box>
                                </>
                            )} */}
                        </Stack>
                    </Tabs.Panel>

                    <Tabs.Panel value="driver" p="lg">
                        <Stack>
                            <Group grow>
                                <Paper withBorder p="xs" radius="sm">
                                    <Text size="xs" c="dimmed" tt="uppercase" fw={700}>{t('profile.tripsCompleted')}</Text>
                                    <Text fw={700} size="xl">{profile.driver_profile.completed_trips}</Text>
                                </Paper>
                                <Paper withBorder p="xs" radius="sm">
                                    <Text size="xs" c="dimmed" tt="uppercase" fw={700}>{t('profile.rating')}</Text>
                                    <Text fw={700} size="xl">{profile.driver_profile.rating ? profile.driver_profile.rating.toFixed(1) : 'N/A'}</Text>
                                </Paper>
                            </Group>

                            {isEditing && (
                                <Text c="dimmed" size="sm" fs="italic" ta="center" mt="md">
                                    {t('profile.driverStatsDesc')}
                                </Text>
                            )}
                        </Stack>
                    </Tabs.Panel>
                </Tabs>
            </Paper>
        </Container>
    )
}