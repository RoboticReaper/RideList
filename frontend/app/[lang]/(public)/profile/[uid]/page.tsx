'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Container, Paper, Avatar, Text, Group, Stack, Badge, Loader, Center, Title, Button, TextInput, ActionIcon, Box, Tabs, NumberInput, Divider } from '@mantine/core';
import { useAuth } from '@/components/firebase/AuthContext';
import { IconCheck, IconPhone, IconCalendar, IconPencil, IconX, IconDeviceFloppy, IconCar, IconSteeringWheel } from '@tabler/icons-react';

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
    const params = useParams();
    const uid = params.uid as string;
    const { user } = useAuth();
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState('');
    const [editPhone, setEditPhone] = useState('');
    const [editBigLuggage, setEditBigLuggage] = useState(0);
    const [editSmallLuggage, setEditSmallLuggage] = useState(0);
    const [nameError, setNameError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const isOwner = user?.uid === uid;

    const startEditing = () => {
        if (profile) {
            setEditName(profile.name);
            setEditPhone(profile.phone || '');
            setEditBigLuggage(profile.rider_profile?.default_big_luggage || 0);
            setEditSmallLuggage(profile.rider_profile?.default_small_luggage || 0);
            setNameError(null);
            setIsEditing(true);
        }
    };

    const cancelEditing = () => {
        setIsEditing(false);
        setNameError(null);
    };

    const saveProfile = async () => {
        if (!user) return;

        if (!editName.trim()) {
            setNameError('Name is required');
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
            alert("Failed to save profile");
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
                    if (res.status === 404) throw new Error("Profile not found");
                    throw new Error("Failed to fetch profile");
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
                    <Avatar src={profile.photo_url} size={120} radius={120} mx="auto" />
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
                                        {profile.verified && <Badge color="green" leftSection={<IconCheck size={12} />}>Verified Student</Badge>}
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
                            <Text>Joined {new Date(profile.created_at).toLocaleDateString()}</Text>
                        </Group>

                        {isEditing ? (
                            <TextInput
                                value={editPhone}
                                onChange={(e) => setEditPhone(e.target.value)}
                                label="Phone"
                                placeholder="Used for coordination"
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
                                    <Group gap="xs">
                                        <IconPhone size={16} color="var(--mantine-color-dimmed)" />
                                        <Text c="dimmed" size="sm">
                                            Phone number hidden (booking required)
                                        </Text>
                                    </Group>
                                )}

                                {profile.phone_privacy === 'MISSING' && (
                                    <Group gap="xs">
                                        <IconPhone size={16} color="var(--mantine-color-dimmed)" />
                                        <Text c="dimmed" size="sm" fs="italic">
                                            No phone number added
                                        </Text>
                                    </Group>
                                )}
                            </>
                        )}

                        {isEditing && (
                            <Group mt="md">
                                <Button leftSection={<IconDeviceFloppy size={16} />} onClick={saveProfile} loading={saving}>Save</Button>
                                <Button leftSection={<IconX size={16} />} variant="default" onClick={cancelEditing} disabled={saving}>Cancel</Button>
                            </Group>
                        )}

                    </Stack>
                </Group>
            </Paper>

            <Paper radius="md" withBorder mt="md" bg="var(--mantine-color-body)">
                <Tabs defaultValue="rider">
                    <Tabs.List>
                        <Tabs.Tab value="rider" leftSection={<IconCar size={16} />}>Rider Profile</Tabs.Tab>
                        <Tabs.Tab value="driver" leftSection={<IconSteeringWheel size={16} />}>Driver Profile</Tabs.Tab>
                    </Tabs.List>

                    <Tabs.Panel value="rider" p="lg">
                        <Stack>
                            <Group grow>
                                <Paper withBorder p="xs" radius="sm">
                                    <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Rides Taken</Text>
                                    <Text fw={700} size="xl">{profile.rider_profile.completed_rides}</Text>
                                </Paper>
                                <Paper withBorder p="xs" radius="sm">
                                    <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Rating</Text>
                                    <Text fw={700} size="xl">{profile.rider_profile.rating ? profile.rider_profile.rating.toFixed(1) : 'N/A'}</Text>
                                </Paper>
                            </Group>

                            {(profile.rider_profile.default_small_luggage !== null || isEditing) && (
                                <>
                                    <Divider label="Preferences" labelPosition="center" />

                                    <Box>
                                        <Text c="dimmed" size="xs" ta="center" mb="sm">
                                            This field is only visible to you and will be used to autofill luggage while searching.
                                        </Text>
                                        <Group grow>
                                            <NumberInput
                                                label="Small Luggage Preference"
                                                description="Luggages that fit as carry-on"
                                                min={0}
                                                max={10}
                                                value={isEditing ? editSmallLuggage : (profile.rider_profile.default_small_luggage ?? 0)}
                                                onChange={(v) => setEditSmallLuggage(typeof v === 'number' ? v : 0)}
                                                readOnly={!isEditing}
                                                variant={isEditing ? 'default' : 'unstyled'}
                                            />
                                            <NumberInput
                                                label="Big Luggage Preference"
                                                description="Luggages that fit as checked baggage"
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
                            )}
                        </Stack>
                    </Tabs.Panel>

                    <Tabs.Panel value="driver" p="lg">
                        <Stack>
                            <Group grow>
                                <Paper withBorder p="xs" radius="sm">
                                    <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Trips Completed</Text>
                                    <Text fw={700} size="xl">{profile.driver_profile.completed_trips}</Text>
                                </Paper>
                                <Paper withBorder p="xs" radius="sm">
                                    <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Rating</Text>
                                    <Text fw={700} size="xl">{profile.driver_profile.rating ? profile.driver_profile.rating.toFixed(1) : 'N/A'}</Text>
                                </Paper>
                            </Group>

                            {isEditing && (
                                <Text c="dimmed" size="sm" fs="italic" ta="center" mt="md">
                                    Driver statistics are automatically updated and cannot be manually edited.
                                </Text>
                            )}
                        </Stack>
                    </Tabs.Panel>
                </Tabs>
            </Paper>
        </Container>
    )
}