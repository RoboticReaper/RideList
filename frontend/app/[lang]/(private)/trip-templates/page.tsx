'use client';
import { useEffect, useState } from 'react';
import { Container, Title, Button, Group, Card, Text, SimpleGrid, Loader, Badge, ActionIcon, Menu } from '@mantine/core';
import { IconPlus, IconDotsVertical, IconCar, IconMapPin } from '@tabler/icons-react';
import { useAuth } from '@/components/firebase/AuthContext';
import { LocalizedLink } from '@/components/LocalizedLink';
import { useTranslation } from 'react-i18next';

export default function TripTemplatesPage() {
    const { t } = useTranslation('common');
    console.log(t)
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
                <Title order={2}>{t('templates.trips.title')}</Title>
                <Button component={LocalizedLink} href="/trip-templates/new" leftSection={<IconPlus size={16} />}>
                    {t('templates.trips.create')}
                </Button>
            </Group>

            {templates.length === 0 ? (
                <Text c="dimmed">{t('templates.trips.noTemplates')}</Text>
            ) : (
                <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
                    {templates.map(template => (
                        <Card key={template.id} shadow="sm" padding="lg" radius="md" withBorder>
                            <Group justify="space-between" mb="xs">
                                <Text fw={500} truncate>{template.name}</Text>
                                <Menu shadow="md" width={200}>
                                    <Menu.Target>
                                        <ActionIcon variant="subtle" color="gray"><IconDotsVertical size={16} /></ActionIcon>
                                    </Menu.Target>
                                    <Menu.Dropdown>
                                        <Menu.Item component={LocalizedLink} href={`/trip-templates/${template.id}`}>
                                            {t('common.edit')}
                                        </Menu.Item>
                                    </Menu.Dropdown>
                                </Menu>
                            </Group>

                            <Group gap="xs" mb="sm">
                                <Badge color="blue" variant="light">${template.price}</Badge>
                                <Badge color="gray" variant="light">{template.total_seats} seats</Badge>
                            </Group>

                            <Text size="sm" c="dimmed" lineClamp={2} style={{ minHeight: '40px' }}>
                                {template.from_text} → {template.to_text}
                            </Text>

                            {template.car_details && (
                                <Group gap="xs" mt="md">
                                    <IconCar size={16} style={{ opacity: 0.5 }} />
                                    <Text size="xs" c="dimmed">{template.car_details.make} {template.car_details.model}</Text>
                                </Group>
                            )}
                        </Card>
                    ))}
                </SimpleGrid>
            )}
        </Container>
    )
}
