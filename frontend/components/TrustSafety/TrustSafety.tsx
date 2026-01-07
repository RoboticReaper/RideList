'use client';
import { useTranslation } from 'react-i18next';
import { Accordion, Container, Title } from '@mantine/core';
import classes from './TrustSafety.module.css';

export function TrustSafety() {
  const { t } = useTranslation('common');

  return (
    <Container size="sm" className={classes.wrapper}>
      <Title ta="center" className={classes.title}>
        {t('trustSafety.title')}
      </Title>

      <Accordion variant="separated">
        <Accordion.Item className={classes.item} value="reset-password">
          <Accordion.Control>{t('trustSafety.questions.resetPass')}</Accordion.Control>
          <Accordion.Panel>{t('trustSafety.placeholder')}</Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item className={classes.item} value="another-account">
          <Accordion.Control>{t('trustSafety.questions.multiAccount')}</Accordion.Control>
          <Accordion.Panel>{t('trustSafety.placeholder')}</Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item className={classes.item} value="newsletter">
          <Accordion.Control>{t('trustSafety.questions.newsletter')}</Accordion.Control>
          <Accordion.Panel>{t('trustSafety.placeholder')}</Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item className={classes.item} value="credit-card">
          <Accordion.Control>{t('trustSafety.questions.creditCard')}</Accordion.Control>
          <Accordion.Panel>{t('trustSafety.placeholder')}</Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item className={classes.item} value="payment">
          <Accordion.Control>{t('trustSafety.questions.payment')}</Accordion.Control>
          <Accordion.Panel>{t('trustSafety.placeholder')}</Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Container>
  );
}