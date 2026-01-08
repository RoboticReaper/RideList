'use client'
import { useState } from 'react';
import {
    IconBook,
    IconChartPie3,
    IconChevronDown,
    IconCode,
    IconCoin,
    IconFingerprint,
    IconLogout,
    IconNotification,
    IconWorld,
    IconLayoutDashboard,
    IconHistory,
    IconUser,
    IconSettings,
} from '@tabler/icons-react';
import {
    ActionIcon,
    Anchor,
    Avatar,
    Box,
    Burger,
    Button,
    Center,
    Collapse,
    Divider,
    Drawer,
    Group,
    HoverCard,
    Image,
    Menu,
    ScrollArea,
    SimpleGrid,
    SegmentedControl,
    Text,
    ThemeIcon,
    Tooltip,
    UnstyledButton,
    useMantineTheme,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import classes from './DashboardHeaderMenu.module.css';
import { getLocalizedHref, LocalizedLink } from '../LocalizedLink';
import { useParams, useRouter, usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { languages } from '@/app/i18n/settings';
import { useAuth } from '../firebase/AuthContext';
import { getAuth, signOut } from 'firebase/auth';
import { app } from '../firebase/firebase';
import Notifications from '../Notifications/Notifications';


interface DashboardHeaderMenuProps {
    role: string;
    onRoleChange: (role: string) => void;
    drawerOpened: boolean;
    toggleDrawer: () => void;
    closeDrawer: () => void;
}

export function DashboardHeaderMenu({ role, onRoleChange, drawerOpened, toggleDrawer, closeDrawer }: DashboardHeaderMenuProps) {
    const [linksOpened, { toggle: toggleLinks }] = useDisclosure(false);
    const theme = useMantineTheme();
    const { t, i18n } = useTranslation('common')
    const { user, loading } = useAuth();
    const router = useRouter()
    const params = useParams()
    const pathname = usePathname();

    return (
        <Box>
            <header className={classes.header}>
                <Group justify="space-between" h="100%" gap={0}>
                    <Group h="100%" gap={0}>
                        <Burger opened={drawerOpened} onClick={toggleDrawer} hiddenFrom="sm" size="md" mr="xs" />
                        <LocalizedLink href="/">
                            <Image src="/logo_small.png" fit="contain" className={classes.logo} hiddenFrom="xs" />
                            <Image src="/logo.png" fit="contain" className={classes.logo} visibleFrom="xs" />
                        </LocalizedLink>
                    </Group>

                    <Group h="100%" gap={0}>
                        <SegmentedControl
                            value={role}
                            onChange={(value) => {
                                const driverOnlyRoutes = ['/trip-templates', '/rule-templates', '/cars'];
                                if (value === 'rider' && driverOnlyRoutes.some(route => pathname.includes(route))) {
                                    router.push('/dashboard');
                                }
                                onRoleChange(value);
                                closeDrawer();
                            }}
                            size="sm"
                            radius="xl"
                            color="blue"
                            data={[
                                { label: t('headerMenu.roles.rider'), value: 'rider' },
                                { label: t('headerMenu.roles.driver'), value: 'driver' },
                            ]}
                        />
                    </Group>

                    <Group gap="xs">
                        <Menu shadow="md" width={200}>
                            <Menu.Target>
                                <ActionIcon variant="subtle" color="gray" visibleFrom="sm">
                                    <IconWorld size={20} />
                                </ActionIcon>
                            </Menu.Target>

                            <Menu.Dropdown>
                                {languages.map((lng) => (
                                    <Menu.Item key={lng} onClick={async () => {
                                        if (user) {
                                            try {
                                                const token = await user.getIdToken();
                                                await fetch('/api/account-settings', {
                                                    method: 'POST',
                                                    body: JSON.stringify({ language: lng }),
                                                    headers: { 'Authorization': `Bearer ${token}` }
                                                });
                                            } catch (e) {
                                                console.error(e);
                                            }
                                        }
                                        const currentLang = pathname.split('/')[1];
                                        let newPath = pathname;
                                        if (languages.includes(currentLang)) {
                                            newPath = pathname.replace(`/${currentLang}`, `/${lng}`);
                                        } else {
                                            newPath = `/${lng}${pathname === '/' ? '' : pathname}`;
                                        }
                                        router.push(newPath);
                                    }}>
                                        {lng === 'en' ? 'English' : lng === 'zh' ? '中文' : lng.toUpperCase()}
                                    </Menu.Item>
                                ))}
                            </Menu.Dropdown>
                        </Menu>

                        <Notifications />
                        {!loading && user ? (
                            <Menu shadow="md" width={230}>
                                <Menu.Target>
                                    <UnstyledButton>
                                        <Avatar src={user?.photoURL} radius="xl" />
                                    </UnstyledButton>
                                </Menu.Target>

                                <Menu.Dropdown>
                                    <Menu.Label>{t('headerMenu.account')}</Menu.Label>
                                    <Text size="sm" truncate px="sm">
                                        {user?.email}
                                    </Text>
                                    <Menu.Divider />
                                    <Menu.Item
                                        component={LocalizedLink}
                                        href="/dashboard"
                                        leftSection={<IconLayoutDashboard size={14} />}
                                    >
                                        {t('headerMenu.dashboard')}
                                    </Menu.Item>
                                    <Menu.Item
                                        component={LocalizedLink}
                                        href={"/profile/" + user?.uid}
                                        leftSection={<IconUser size={14} />}
                                    >
                                        {t('headerMenu.profile')}
                                    </Menu.Item>
                                    <Menu.Item
                                        component={LocalizedLink}
                                        href="/history"
                                        leftSection={<IconHistory size={14} />}
                                    >
                                        {t('headerMenu.history')}
                                    </Menu.Item>
                                    <Menu.Item
                                        component={LocalizedLink}
                                        href="/settings"
                                        leftSection={<IconSettings size={14} />}
                                    >
                                        {t('headerMenu.settings')}
                                    </Menu.Item>
                                    <Menu.Divider />
                                    <Menu.Item
                                        color="red"
                                        leftSection={<IconLogout size={14} />}
                                        onClick={() => {
                                            signOut(getAuth(app));
                                        }}
                                    >
                                        {t('headerMenu.logout')}
                                    </Menu.Item>
                                </Menu.Dropdown>
                            </Menu>
                        ) : (
                            <LocalizedLink href="/auth">
                                <Button>{t('headerMenu.login')}</Button>
                            </LocalizedLink>
                        )}
                    </Group>


                </Group>
            </header>

            <Drawer
                opened={drawerOpened && false}
                onClose={closeDrawer}
                closeButtonProps={{ size: 'xl' }}
                title={
                    <LocalizedLink href="/" onClick={closeDrawer}>
                        <Image src="/logo.png" fit="contain" h={40} w="auto" />
                    </LocalizedLink>
                }
                hiddenFrom="sm"
                zIndex={1000000}
            >
                <ScrollArea h="calc(100vh - 80px)" mx="-md">
                    <Divider mb="sm" />


                </ScrollArea>
            </Drawer>
        </Box>
    );
}