'use client';
import { useEffect, useState } from 'react';
import { Container, Title, Button, Group, Card, Text, SimpleGrid, Loader, Badge, ActionIcon, Menu } from '@mantine/core';
import { IconPlus, IconDotsVertical, IconCar, IconMapPin } from '@tabler/icons-react';
import { useAuth } from '@/components/firebase/AuthContext';
import { LocalizedLink } from '@/components/LocalizedLink';

export default function TripTemplatesPage() {
    const { user } = useAuth();
    const [templates, setTemplates] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (user) {
            user.getIdToken().then(token => {
                fetch('/api/user/trip-templates', {
                    headers: { 'Authorization': `Bearer ${token}` }
                })
                    .then(res => res.json())
                    .then(data => {
                        if (data.templates) setTemplates(data.templates);
                    })
                    .finally(() => setLoading(false));
            });
        }
    }, [user]);

    if (loading) return <Container py="xl"><Loader /></Container>;

    return (
        <Container size="xl" py="xl">
            <Group justify="space-between" mb="lg">
                <Title order={2}>Trip Templates</Title>
                <Button component={LocalizedLink} href="/trip-templates/new" leftSection={<IconPlus size={16} />}>
                    Create Trip Template
                </Button>
            </Group>

            {templates.length === 0 ? (
                <Text c="dimmed">No trip templates found. Create one to get started!</Text>
            ) : (
                <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
                    {templates.map(t => (
                        <Card key={t.id} shadow="sm" padding="lg" radius="md" withBorder>
                            <Group justify="space-between" mb="xs">
                                <Text fw={500} truncate>{t.name}</Text>
                                <Menu shadow="md" width={200}>
                                    <Menu.Target>
                                        <ActionIcon variant="subtle" color="gray"><IconDotsVertical size={16} /></ActionIcon>
                                    </Menu.Target>
                                    <Menu.Dropdown>
                                        <Menu.Item component={LocalizedLink} href={`/trip-templates/${t.id}`}>
                                            Edit
                                        </Menu.Item>
                                    </Menu.Dropdown>
                                </Menu>
                            </Group>

                            <Group gap="xs" mb="sm">
                                <Badge color="blue" variant="light">${t.price}</Badge>
                                <Badge color="gray" variant="light">{t.total_seats} seats</Badge>
                            </Group>

                            <Text size="sm" c="dimmed" lineClamp={2} style={{ minHeight: '40px' }}>
                                {t.from_text} → {t.to_text}
                            </Text>

                            {t.car_details && (
                                <Group gap="xs" mt="md">
                                    <IconCar size={16} style={{ opacity: 0.5 }} />
                                    <Text size="xs" c="dimmed">{t.car_details.make} {t.car_details.model}</Text>
                                </Group>
                            )}
                        </Card>
                    ))}
                </SimpleGrid>
            )}
        </Container>
    )
}
