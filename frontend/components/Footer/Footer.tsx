'use client'

import { useTranslation } from 'react-i18next';
import { Anchor, Container, Group, Image } from '@mantine/core';
import { LocalizedLink } from '../LocalizedLink';
import classes from './Footer.module.css';

export function Footer() {
  const { t } = useTranslation('common');
  const links = [
    { link: '#', label: t('footer.contact') },
    { link: '#', label: t('footer.privacy') },
    { link: '#', label: t('footer.blog') },
    { link: '#', label: t('footer.careers') },
  ];

  const items = links.map((link) => (
    <Anchor<'a'>
      c="dimmed"
      key={link.label}
      href={link.link}
      onClick={(event) => event.preventDefault()}
      size="sm"
    >
      {link.label}
    </Anchor>
  ));

  return (
    <div className={classes.footer}>
      <Container className={classes.inner}>
        <LocalizedLink href="/">
          <Image src="/logo.png" fit="contain" className={classes.logo} />
        </LocalizedLink>
        <Group className={classes.links}>{items}</Group>
      </Container>
    </div>
  );
}