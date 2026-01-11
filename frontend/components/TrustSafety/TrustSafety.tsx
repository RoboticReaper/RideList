'use client';
import { useTranslation } from 'react-i18next';
import { Accordion, Container, Title, Stack, Text } from '@mantine/core';
import classes from './TrustSafety.module.css';

const SECTION_KEYS = [
  'accounts',
  'posting',
  'locations',
  'searching',
  'payments',
  'pickup',
  'lifecycle',
  'notifications',
  'safety',
  'history',
  'general',
] as const;

export function TrustSafety() {
  const { t } = useTranslation('common');

  return (
    <Container size="sm" className={classes.wrapper}>
      <Title ta="center" className={classes.title} id="faq">
        {t('trustSafety.title')}
      </Title>

      <Accordion variant="separated" multiple>
        {SECTION_KEYS.map((key) => (
          <Accordion.Item className={classes.item} value={key} key={key}>
            <Accordion.Control>{t(`trustSafety.sections.${key}.title`)}</Accordion.Control>
            <Accordion.Panel>
              <Stack gap="xl" py="xs">
                {(t(`trustSafety.sections.${key}.questions`, { returnObjects: true }) as any[])?.map((qa: any, i: number) => (
                  <div key={i}>
                    <Text fw={700} mb="xs" size="lg" c="blue.7">{qa.q}</Text>
                    <Text style={{ whiteSpace: 'pre-line' }} lh={1.6}>{qa.a}</Text>
                  </div>
                ))}
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>
    </Container>
  );
}