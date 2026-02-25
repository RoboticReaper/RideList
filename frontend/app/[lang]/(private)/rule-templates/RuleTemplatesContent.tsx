'use client';
import { useEffect, useState } from 'react';
import { Container, Title, Button, Group, Card, Text, SimpleGrid, Loader, ActionIcon, Menu, Badge } from '@mantine/core';
import { IconPlus, IconDotsVertical, IconReceipt2 } from '@tabler/icons-react';
import { useAuth } from '@/components/firebase/AuthContext';
import { LocalizedLink } from '@/components/LocalizedLink';
import { useTranslation } from 'react-i18next';

export default function RuleTemplatesPage() {
    const { t } = useTranslation('common');
    const { user } = useAuth();
    const [templates, setTemplates] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (user) {
            user.getIdToken().then(token => {
                fetch('/api/user/rule-templates', {
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
                <Title order={2}>{t('templates.rules.title')}</Title>
                <Button component={LocalizedLink} href="/rule-templates/new" leftSection={<IconPlus size={16} />}>
                    {t('templates.rules.create')}
                </Button>
            </Group>

            {templates.length === 0 ? (
                <Text c="dimmed">{t('templates.rules.noTemplates')}</Text>
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
                                        <Menu.Item component={LocalizedLink} href={`/rule-templates/${template.id}`}>
                                            {t('common.edit')}
                                        </Menu.Item>
                                    </Menu.Dropdown>
                                </Menu>
                            </Group>

                            <Group gap="xs" mb="sm">
                                {template.auto_accept && <Badge color="green" variant="light">{t('templates.rules.form.autoAccept')}</Badge>}
                                <Badge color="gray" variant="light">{t('templates.rules.luggageDisplay', { big: template.big_luggage_lim ?? '∞', small: template.small_luggage_lim ?? '∞' })}</Badge>
                                {((template.big_luggage_paid || 0) > 0 || (template.small_luggage_paid || 0) > 0) && (
                                    <Badge color="blue" variant="light">{t('templates.rules.paidLuggageDisplay', { big: template.big_luggage_paid ?? 0, bigPrice: template.big_luggage_paid_price ?? 0, small: template.small_luggage_paid ?? 0, smallPrice: template.small_luggage_paid_price ?? 0 })}</Badge>
                                )}
                            </Group>

                            <Text size="sm" c="dimmed" lineClamp={2}>
                                {template.pickup_rules || t('templates.rules.noPickupRules')}
                            </Text>
                        </Card>
                    ))}
                </SimpleGrid>
            )}
        </Container>
    )
}
