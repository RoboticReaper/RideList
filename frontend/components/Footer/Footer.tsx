'use client'

import { Anchor, Container, Group, Image } from '@mantine/core';
import { LocalizedLink } from '../LocalizedLink';
import classes from './Footer.module.css';

const links = [
  { link: '#', label: 'Contact' },
  { link: '#', label: 'Privacy' },
  { link: '#', label: 'Blog' },
  { link: '#', label: 'Careers' },
];

export function Footer() {
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