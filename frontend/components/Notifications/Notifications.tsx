import { useState, useEffect } from 'react';
import { useAuth } from '../firebase/AuthContext';
import { Menu, ActionIcon, Text, ScrollArea, Button, Group, Indicator, Loader, Box, Stack } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconBell, IconCheck, IconSettings } from '@tabler/icons-react';
import { useNotifications, NotificationItem } from './NotificationContext';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { LocalizedLink } from '../LocalizedLink';
import { useTranslation } from 'react-i18next';

dayjs.extend(relativeTime);

export default function Notifications() {
    const { t } = useTranslation('common');
    const { user } = useAuth();
    const [opened, setOpened] = useState(false);
    const { notifications, unreadCount, isLoading, hasMore, fetchMore, markAsRead } = useNotifications();
    const isMobile = useMediaQuery('(max-width: 450px)');
    const [mounted, setMounted] = useState(false);


    const handleNotificationClick = async (n: NotificationItem) => {
        if (!n.read) {
            await markAsRead([n.id]);
        }
    };

    const handleMarkAllRead = async () => {
        const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
        if (unreadIds.length > 0) {
            await markAsRead(unreadIds);
        }
    };

    return (
        <Menu shadow="md" width={isMobile ? '94vw' : 400} position={isMobile ? 'bottom' : 'bottom-end'} opened={opened} onChange={setOpened}>
            <Menu.Target>
                <Indicator label={unreadCount} size={16} disabled={unreadCount === 0} color="red" offset={4}>
                    <ActionIcon variant="subtle" color="gray" size="lg">
                        <IconBell size={22} />
                    </ActionIcon>
                </Indicator>
            </Menu.Target>

            <Menu.Dropdown>
                <Group justify="space-between" px="sm" py="xs" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
                    <Group gap={5}>
                        <Text fw={600} size="sm">{t('headerMenu.notifications.ui.title')}</Text>
                        <ActionIcon component={LocalizedLink} href="/roleSettings" variant="subtle" color="gray" size="sm" onClick={() => setOpened(false)}>
                            <IconSettings size={16} />
                        </ActionIcon>
                    </Group>
                    {unreadCount > 0 && (
                        <Button variant="subtle" size="xs" onClick={handleMarkAllRead}>
                            {t('headerMenu.notifications.ui.markAllRead')}
                        </Button>
                    )}
                </Group>

                <ScrollArea.Autosize mah={400} type="always">
                    {notifications.length === 0 && !isLoading ? (
                        <Box py="xl" ta="center">
                            <Text c="dimmed" size="sm">{t('headerMenu.notifications.ui.empty')}</Text>
                        </Box>
                    ) : (
                        <Stack gap={0}>
                            {notifications.map((n) => {
                                const isRead = n.read;
                                const content = (
                                    <Group align="start" wrap="nowrap">
                                        <Box style={{ flex: 1 }}>
                                            <Group justify="space-between" mb={4}>
                                                <Text size="sm" fw={isRead ? 400 : 600} lineClamp={1}>
                                                    {n.title}
                                                </Text>
                                                {!isRead && (
                                                    <Button
                                                        variant="subtle"
                                                        color="blue"
                                                        size="compact-xs"
                                                        leftSection={<IconCheck size={14} />}
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            markAsRead([n.id]);
                                                        }}
                                                    >
                                                        {t('headerMenu.notifications.ui.markRead')}
                                                    </Button>
                                                )}
                                            </Group>
                                            <Text size="xs" c="dimmed" lineClamp={2} mb={4}>
                                                {n.body}
                                            </Text>
                                            <Text size="xs" c="dimmed">
                                                {dayjs(n.created_at).fromNow()}
                                            </Text>
                                        </Box>
                                    </Group>
                                );

                                const itemStyles = {
                                    position: 'relative' as const,
                                    borderBottom: '1px solid var(--mantine-color-default-border)',
                                    backgroundColor: isRead ? undefined : 'var(--mantine-color-blue-light)',
                                    borderRadius: 0,
                                };

                                if (n.open_link) {
                                    return (
                                        <Menu.Item
                                            key={n.id}
                                            component={LocalizedLink}
                                            href={n.open_link}
                                            onClick={() => handleNotificationClick(n)}
                                            style={itemStyles}
                                        >
                                            {content}
                                        </Menu.Item>
                                    );
                                }

                                return (
                                    <Menu.Item
                                        key={n.id}
                                        onClick={() => handleNotificationClick(n)}
                                        style={itemStyles}
                                    >
                                        {content}
                                    </Menu.Item>
                                );
                            })}
                        </Stack>
                    )}

                    {isLoading && (
                        <Box py="md" style={{ display: 'flex', justifyContent: 'center' }}>
                            <Loader size="xs" />
                        </Box>
                    )}

                    {!isLoading && hasMore && notifications.length > 0 && (
                        <Box p="xs">
                            <Button fullWidth variant="light" size="xs" onClick={(e) => {
                                e.stopPropagation();
                                fetchMore();
                            }}>
                                {t('headerMenu.notifications.ui.loadMore')}
                            </Button>
                        </Box>
                    )}
                </ScrollArea.Autosize>
            </Menu.Dropdown>
        </Menu >
    );
}