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
  IconHistory,
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
import { useParams, useRouter, usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { languages } from '@/app/i18n/settings';
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
  const pathname = usePathname();

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
            <Menu shadow="md" width={230}>
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
                {t('headerMenu.language')}
              </Box>
              <IconChevronDown
                style={{ width: 16, height: 16, transform: linksOpened ? 'rotate(180deg)' : 'none' }}
                color={theme.colors.blue[6]}
              />
            </Center>
          </UnstyledButton>
          <Collapse in={linksOpened}>
            {languages.map((lng) => (
              <UnstyledButton key={lng} className={classes.mobileLink} style={{ paddingLeft: '2rem' }} onClick={async () => {
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
                closeDrawer();
              }}>
                {lng === 'en' ? 'English' : lng === 'zh' ? '中文' : lng.toUpperCase()}
              </UnstyledButton>
            ))}
          </Collapse>

          <Divider my="sm" />

          <Group justify="center" grow pb="xl" px="md">
            {loading ? <Text>{t('common.loading')}</Text> : null}
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
                  {t('headerMenu.dashboard')}
                </Button>
                <Button
                  fullWidth
                  variant="subtle"
                  leftSection={<IconUser size={14} />}
                  justify="start"
                  mb="xs"
                  component={LocalizedLink}
                  href={"/profile/" + user?.uid}
                  onClick={closeDrawer}
                >
                  {t('headerMenu.profile')}
                </Button>
                <Button
                  fullWidth
                  variant="subtle"
                  leftSection={<IconHistory size={14} />}
                  justify="start"
                  mb="xs"
                  component={LocalizedLink}
                  href="/history"
                  onClick={closeDrawer}
                >
                  {t('headerMenu.history')}
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
                  {t('headerMenu.settings')}
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
                  {t('headerMenu.logout')}
                </Button>
              </Box>
            )}
          </Group>
        </ScrollArea>
      </Drawer>
    </Box>
  );
}