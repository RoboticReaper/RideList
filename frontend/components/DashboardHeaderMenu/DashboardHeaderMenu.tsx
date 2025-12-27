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
import { useParams, useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
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
                                onRoleChange(value);
                                closeDrawer();
                            }}
                            size="sm"
                            radius="xl"
                            color="blue"
                            data={[
                                { label: 'Rider', value: 'rider' },
                                { label: 'Driver', value: 'driver' },
                            ]}
                        />
                    </Group>

                    <Group>
                        <Notifications />
                        {!loading && user ? (
                            <Menu shadow="md" width={200}>
                                <Menu.Target>
                                    <UnstyledButton>
                                        <Avatar src={user?.photoURL} radius="xl" />
                                    </UnstyledButton>
                                </Menu.Target>

                                <Menu.Dropdown>
                                    <Menu.Label>Account</Menu.Label>
                                    <Text size="sm" truncate px="sm">
                                        {user?.email}
                                    </Text>
                                    <Menu.Divider />
                                    <Menu.Item
                                        component={LocalizedLink}
                                        href="/dashboard"
                                        leftSection={<IconLayoutDashboard size={14} />}
                                    >
                                        Dashboard
                                    </Menu.Item>
                                    <Menu.Item
                                        component={LocalizedLink}
                                        href={"/profile/" + user?.uid}
                                        leftSection={<IconUser size={14} />}
                                    >
                                        Profile
                                    </Menu.Item>
                                    <Menu.Item
                                        component={LocalizedLink}
                                        href="/settings"
                                        leftSection={<IconSettings size={14} />}
                                    >
                                        Settings
                                    </Menu.Item>
                                    <Menu.Divider />
                                    <Menu.Item
                                        color="red"
                                        leftSection={<IconLogout size={14} />}
                                        onClick={() => {
                                            signOut(getAuth(app));
                                        }}
                                    >
                                        Logout
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
                        <Image src="/logo.png" fit="contain" h={44} w="auto" />
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