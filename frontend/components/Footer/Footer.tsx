'use client'

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Anchor, Button, Container, Group, Image, Modal, Stack, Text, Textarea } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { LocalizedLink } from '../LocalizedLink';
import { useAuth } from '@/components/firebase/AuthContext';
import classes from './Footer.module.css';

export function Footer() {
  const { t } = useTranslation('common');
  const { user, handleProtectedAction } = useAuth();
  const [opened, { open, close }] = useDisclosure(false);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleContactClick = (e: React.MouseEvent) => {
    e.preventDefault();
    handleProtectedAction(() => {
      open();
    });
  };

  const sendFeedback = async () => {
    if (!message.trim()) return;
    setSubmitting(true);
    try {
      const token = await user?.getIdToken();
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ message })
      });

      const data = await res.json();

      if (!res.ok) {
        notifications.show({
          title: t('feedback.modalTitle'),
          message: data.error || t('api.errors.internalError'),
          color: 'red'
        });
      } else {
        notifications.show({
          title: t('feedback.success'),
          message: t('feedback.success'),
          color: 'green'
        });
        setMessage('');
        close();
      }
    } catch (e) {
      notifications.show({
        title: 'Error',
        message: t('api.errors.internalError'),
        color: 'red'
      });
    } finally {
      setSubmitting(false);
    }
  };

  const links = [
    { link: '#', label: t('footer.contact'), onClick: handleContactClick },
    { link: '/#faq', label: t('footer.faq') },
    { link: '/how', label: t('footer.howItWorks') },
    { link: '/trustsafety', label: t('footer.trustSafety') },
    { link: '/privacy', label: t('footer.privacy') },
    { link: '/tos', label: t('footer.tos') },
  ];

  const items = links.map((link) => (
    <Anchor
      component={link.onClick ? 'a' : (LocalizedLink as any)}
      c="dimmed"
      key={link.label}
      href={link.link}
      size="sm"
      onClick={link.onClick}
    >
      {link.label}
    </Anchor>
  ));

  return (
    <div className={classes.footer}>
      <Container className={classes.inner}>
        <LocalizedLink href="/">
          <Image src="/logo.svg" fit="contain" className={classes.logo} />
        </LocalizedLink>
        <Group className={classes.links} style={{ justifyContent: 'center' }}>{items}</Group>
      </Container>

      <Container className={classes.inner} style={{ paddingTop: 0, paddingBottom: 20, justifyContent: 'flex-end' }}>
        <Stack gap={0} align="flex-end">
          <Anchor href="mailto:support@ridelist.app" c="blue" size="sm">
            support@ridelist.app
          </Anchor>
          <Text c="dimmed" size="sm" mt={10}>
            {t('footer.copyright', { year: new Date().getFullYear() })}
          </Text>
        </Stack>
      </Container>

      <Modal opened={opened} onClose={close} title={t('feedback.modalTitle')} centered>
        <Stack>
          <Text size="sm" c="dimmed">{t('feedback.description')}</Text>
          <Textarea
            placeholder={t('feedback.placeholder')}
            minRows={4}
            value={message}
            onChange={(e) => setMessage(e.currentTarget.value)}
          />
          <Button onClick={sendFeedback} loading={submitting} disabled={!message.trim()}>
            {t('feedback.submit')}
          </Button>
        </Stack>
      </Modal>
    </div>
  );
}