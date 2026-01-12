'use client';

import { Button, Container, Group, Text, Title, AppShell } from '@mantine/core';
import { Illustration } from './Illustration';
import classes from './NothingFoundBackground.module.css';
import { HeaderMenu } from '../HeaderMenu/HeaderMenu';
import { LocalizedLink } from '../LocalizedLink';
import { useTranslation } from 'react-i18next';
import { usePathname } from 'next/navigation';
import { TranslationProvider } from '@/app/i18n/provider';

// Import locales directly for the 404 page since it sits outside the [lang] layout
import commonEn from '@/app/i18n/locales/en/common.json';
import commonZh from '@/app/i18n/locales/zh/common.json';

const resources = {
    en: { common: commonEn },
    zh: { common: commonZh }
};

function NotFoundContent() {
    const { t } = useTranslation('common');

    return (
        <AppShell header={{ height: 60 }} padding="0">
            <AppShell.Header>
                <HeaderMenu />
            </AppShell.Header>
            <AppShell.Main>
                <Container className={classes.root}>
                    <div className={classes.inner}>
                        <Illustration className={classes.image} />
                        <div className={classes.content}>
                            <Title className={classes.title}>{t('notFound.title')}</Title>
                            <Text c="dimmed" size="lg" ta="center" className={classes.description}>
                                {t('notFound.description')}
                            </Text>
                            <Group justify="center">
                                <LocalizedLink href="/">
                                    <Button size="md">{t('notFound.backToHome')}</Button>
                                </LocalizedLink>
                            </Group>
                        </div>
                    </div>
                </Container>
            </AppShell.Main>
        </AppShell>
    );
}

export function NothingFoundBackground() {
    const pathname = usePathname();
    const lang = pathname?.startsWith('/zh') ? 'zh' : 'en';

    return (
        <TranslationProvider locale={lang} namespaces={['common']} resources={resources}>
            <NotFoundContent />
        </TranslationProvider>
    );
}