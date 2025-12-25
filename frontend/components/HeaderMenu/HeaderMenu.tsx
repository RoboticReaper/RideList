'use client'
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
  IconBell,
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
  Text,
  ThemeIcon,
  Tooltip,
  UnstyledButton,
  useMantineTheme,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import classes from './HeaderMenu.module.css';
import { LocalizedLink } from '../LocalizedLink';
import { useParams, useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../firebase/AuthContext';
import { getAuth, signOut } from 'firebase/auth';
import { app } from '../firebase/firebase';
import Notifications from '../Notifications/Notifications';


export function HeaderMenu() {
  const [drawerOpened, { toggle: toggleDrawer, close: closeDrawer }] = useDisclosure(false);
  const [linksOpened, { toggle: toggleLinks }] = useDisclosure(false);
  const theme = useMantineTheme();
  const { t, i18n } = useTranslation('common')
  const { user, loading } = useAuth();
  const router = useRouter()

  return (
    <Box>
      <header className={classes.header}>
        <Group justify="space-between" h="100%" gap={0}>
          <Group h="100%" gap={0}>
            <LocalizedLink href="/">
              <Image src="/logo.png" fit="contain" className={classes.logo} />
            </LocalizedLink>
          </Group>

          <Group h="100%" gap={0} visibleFrom="sm">
            <LocalizedLink href="/rides" className={classes.link}>
              {t('headerMenu.findRide')}
            </LocalizedLink>
            <LocalizedLink href="/newRide" className={classes.link}>
              {t('headerMenu.postRide')}
            </LocalizedLink>
            <LocalizedLink href="/" className={classes.link}>
              {t('headerMenu.how')}
            </LocalizedLink>
            <LocalizedLink href="/" className={classes.link}>
              {t('headerMenu.trust')}
            </LocalizedLink>
          </Group>

          <Group>
            <Menu shadow="md" width={200}>
              <Menu.Target>
                <ActionIcon variant="subtle" color="gray" visibleFrom="sm">
                  <IconWorld size={20} />
                </ActionIcon>
              </Menu.Target>

              <Menu.Dropdown>
                <Menu.Item onClick={() => router.push("/en")}>English</Menu.Item>
                <Menu.Item onClick={() => router.push("/zh")}>中文</Menu.Item>
              </Menu.Dropdown>
            </Menu>

            <Notifications />

            {loading ? "Loading" : null}
            {!loading && !user ? (
              <LocalizedLink href="/auth" passHref>
                <Button>{t('headerMenu.login')}</Button>
              </LocalizedLink>
            ) : (

              <Menu shadow="md" width={200}>
                <Menu.Target>
                  <UnstyledButton visibleFrom="sm">
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
                    href="/profile"
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
            )}

            <Burger opened={drawerOpened} onClick={toggleDrawer} hiddenFrom="sm" />
          </Group>


        </Group>
      </header>

      <Drawer
        opened={drawerOpened}
        onClose={closeDrawer}
        position='right'
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

          <LocalizedLink href="/rides" className={classes.mobileLink} onClick={closeDrawer}>
            {t('headerMenu.findRide')}
          </LocalizedLink>
          <LocalizedLink href="/newRide" className={classes.mobileLink} onClick={closeDrawer}>
            {t('headerMenu.postRide')}
          </LocalizedLink>
          <LocalizedLink href="/" className={classes.mobileLink} onClick={closeDrawer}>
            {t('headerMenu.how')}
          </LocalizedLink>
          <LocalizedLink href="/" className={classes.mobileLink} onClick={closeDrawer}>
            {t('headerMenu.trust')}
          </LocalizedLink>

          <UnstyledButton className={classes.mobileLink} onClick={toggleLinks}>
            <Center inline>
              <Box component="span" mr={5}>
                Language
              </Box>
              <IconChevronDown
                style={{ width: 16, height: 16, transform: linksOpened ? 'rotate(180deg)' : 'none' }}
                color={theme.colors.blue[6]}
              />
            </Center>
          </UnstyledButton>
          <Collapse in={linksOpened}>
            <UnstyledButton className={classes.mobileLink} style={{ paddingLeft: '2rem' }} onClick={() => { router.push("/en"); closeDrawer(); }}>
              English
            </UnstyledButton>
            <UnstyledButton className={classes.mobileLink} style={{ paddingLeft: '2rem' }} onClick={() => { router.push("/zh"); closeDrawer(); }}>
              中文
            </UnstyledButton>
          </Collapse>

          <Divider my="sm" />

          <Group justify="center" grow pb="xl" px="md">
            {loading ? <Text>Loading...</Text> : null}
            {!loading && !user ? (
              <LocalizedLink
                href="/auth"
                passHref
                onClick={closeDrawer}
                style={{ textDecoration: 'none' }}
              >
                <Button fullWidth>{t('headerMenu.login')}</Button>
              </LocalizedLink>
            ) : (
              <Box w="100%">
                <Group mb="md">
                  <Avatar src={user?.photoURL} radius="xl" />
                  <Text size="sm" truncate>
                    {user?.email}
                  </Text>
                </Group>
                <Button
                  fullWidth
                  variant="subtle"
                  leftSection={<IconLayoutDashboard size={14} />}
                  justify="start"
                  mb="xs"
                  component={LocalizedLink}
                  href="/dashboard"
                  onClick={closeDrawer}
                >
                  Dashboard
                </Button>
                <Button
                  fullWidth
                  variant="subtle"
                  leftSection={<IconUser size={14} />}
                  justify="start"
                  mb="xs"
                  component={LocalizedLink}
                  href="/profile"
                  onClick={closeDrawer}
                >
                  Profile
                </Button>
                <Button
                  fullWidth
                  variant="subtle"
                  leftSection={<IconSettings size={14} />}
                  justify="start"
                  mb="sm"
                  component={LocalizedLink}
                  href="/settings"
                  onClick={closeDrawer}
                >
                  Settings
                </Button>
                <Button
                  fullWidth
                  variant="default"
                  leftSection={<IconLogout size={14} />}
                  onClick={() => {
                    signOut(getAuth(app));
                    closeDrawer();
                  }}
                >
                  Logout
                </Button>
              </Box>
            )}
          </Group>
        </ScrollArea>
      </Drawer>
    </Box>
  );
}