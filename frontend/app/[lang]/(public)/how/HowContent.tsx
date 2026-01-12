'use client';

import {
    Container,
    Grid,
    Title,
    Text,
    List,
    Paper,
    Anchor,
    Group,
    Stack,
    Box,
    rem,
    ThemeIcon,
    Divider,
    ScrollArea,
    Button,
    Collapse,
    UnstyledButton,
} from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { IconHash, IconCircleCheck, IconInfoCircle, IconChevronDown, IconList } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useDisclosure, useMediaQuery } from '@mantine/hooks';
import classes from './how.module.css';

const SECTION_KEYS = [
    'intro',
    'who',
    'profile',
    'privacy',
    'vehicles',
    'posting',
    'rules',
    'templates',
    'searching',
    'booking',
    'managing',
    'pickup',
    'lifecycle',
    'notifications',
    'historySection',
    'safety',
    'expectations',
    'disclaimers',
    'final',
] as const;

export default function HowPage() {
    const { t } = useTranslation('common');
    const [activeSection, setActiveSection] = useState<string>('');
    const [mobileTocOpened, { toggle: toggleMobileToc }] = useDisclosure(false);
    const isMobile = useMediaQuery('(max-width: 992px)'); // md breakpoint is 62em (992px approx) or use theme.breakpoints

    useEffect(() => {
        const handleScroll = () => {
            const scrollPosition = window.scrollY + 100;
            for (const section of SECTION_KEYS) {
                const element = document.getElementById(section);
                if (element && element.offsetTop <= scrollPosition && element.offsetTop + element.offsetHeight > scrollPosition) {
                    setActiveSection(section);
                    break;
                }
            }
        };

        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const scrollToSection = (id: string, e: React.MouseEvent) => {
        e.preventDefault();
        const element = document.getElementById(id);

        if (element) {
            const scrollAction = () => {
                element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                setActiveSection(id);
            };

            if (isMobile && mobileTocOpened) {
                toggleMobileToc();
                // Short delay to allow collapse to start, but don't wait for full finish
                setTimeout(scrollAction, 100);
            } else {
                scrollAction();
            }
        }
    };

    const TocContent = () => (
        <Stack gap="xs" style={{ borderLeft: isMobile ? 'none' : `1px solid var(--mantine-color-gray-3)` }}>
            {SECTION_KEYS.map((key) => (
                <Box
                    key={key}
                    className={classes.tocLink}
                    data-active={activeSection === key || undefined}
                    onClick={(e) => scrollToSection(key, e)}
                    py={4}
                    pl="md"
                    style={{
                        cursor: 'pointer',
                        borderLeft: !isMobile && activeSection === key ? `2px solid var(--mantine-color-blue-6)` : (!isMobile ? '2px solid transparent' : undefined),
                        marginLeft: !isMobile ? -1 : 0,
                        color: activeSection === key ? 'var(--mantine-color-blue-7)' : 'var(--mantine-color-dimmed)',
                        fontWeight: activeSection === key ? 500 : 400,
                        fontSize: '0.9rem',
                    }}
                >
                    {t(`how.${key}.title`)}
                </Box>
            ))}
        </Stack>
    );

    return (
        <Container size="xl" py="xl">

            {/* Mobile TOC */}
            <Box
                mb="xl"
                hiddenFrom="md"
                style={{
                    position: 'sticky',
                    top: 60,
                    zIndex: 95,
                    backgroundColor: 'var(--mantine-color-body)',
                }}
            >
                <Paper withBorder radius="md" p="sm" bg="gray.0">
                    <UnstyledButton onClick={toggleMobileToc} w="100%">
                        <Group justify="space-between">
                            <Group gap="xs">
                                <IconList size={18} />
                                <Text fw={600}>{t('how.toc', 'Table of Contents')}</Text>
                            </Group>
                            <IconChevronDown
                                size={16}
                                style={{ transform: mobileTocOpened ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
                            />
                        </Group>
                    </UnstyledButton>
                    <Collapse in={mobileTocOpened}>
                        <Divider my="sm" />
                        <ScrollArea.Autosize mah="60vh" type="scroll">
                            <TocContent />
                        </ScrollArea.Autosize>
                    </Collapse>
                </Paper>
            </Box>

            <Grid gutter={{ base: 'md', md: 50 }}>
                {/* Desktop TOC Sidebar */}
                <Grid.Col span={{ base: 12, md: 3 }} visibleFrom="md">
                    <Box style={{ position: 'sticky', top: 80 }}>
                        <Title order={4} mb="md" pl="sm">{t('how.toc', 'Table of Contents')}</Title>
                        <ScrollArea.Autosize mah="calc(100vh - 150px)" type="scroll">
                            <TocContent />
                        </ScrollArea.Autosize>
                    </Box>
                </Grid.Col>

                {/* Main Content */}
                <Grid.Col span={{ base: 12, md: 9 }}>
                    <Title order={1} mb="lg" size="3rem" fz={{ base: '2rem', md: '3rem' }} fw={900}>
                        {t('how.title')}
                    </Title>
                    <Text size="lg" c="dimmed" mb="xl">
                        {t('how.intro.description')}
                    </Text>

                    <Paper withBorder p="xl" radius="md" mb={50} bg="var(--mantine-color-gray-0)">
                        <Group align="flex-start">
                            <ThemeIcon size="lg" variant="light" color="blue">
                                <IconInfoCircle size={20} />
                            </ThemeIcon>
                            <div style={{ flex: 1 }}>
                                <Text size="md" mb="xs" fw={500}>{t('how.intro.noteTitle')}</Text>
                                <Text>{t('how.intro.note')}</Text>
                            </div>
                        </Group>
                    </Paper>

                    <Stack gap={60}>
                        {SECTION_KEYS.map((key) => (
                            <section id={key} key={key} style={{ scrollMarginTop: '100px' }}>
                                <Group mb="md" gap="xs">
                                    <Title order={2}>{t(`how.${key}.title`)}</Title>
                                </Group>
                                <Divider mb="lg" />
                                <ContentRenderer sectionKey={key} />
                            </section>
                        ))}
                    </Stack>
                </Grid.Col>
            </Grid>
        </Container>
    );
}

function ContentRenderer({ sectionKey }: { sectionKey: string }) {
    const { t } = useTranslation('common');

    if (sectionKey === 'intro') {
        return (
            <Stack gap="md">
                <Text fw={600} size="lg">{t('how.intro.listTitle')}</Text>
                <List
                    spacing="sm"
                    size="md"
                    center
                    icon={
                        <ThemeIcon color="blue" size={24} radius="xl">
                            <IconCircleCheck style={{ width: rem(16), height: rem(16) }} />
                        </ThemeIcon>
                    }
                >
                    {(t('how.intro.list', { returnObjects: true }) as string[])?.map((item, i) => (
                        <List.Item key={i}>{item}</List.Item>
                    ))}
                </List>
            </Stack>
        )
    }

    if (sectionKey === 'who') {
        return (
            <Stack gap="xl">
                <Subsection title={t('how.who.access.title')}>
                    <Text mb="sm">{t('how.who.access.p1')}</Text>
                    <Text mb="sm">{t('how.who.access.p2')}</Text>
                    <Text>{t('how.who.access.p3')}</Text>
                </Subsection>
            </Stack>
        )
    }

    if (sectionKey === 'profile') {
        return (
            <Stack gap="xl">
                <Subsection title={t('how.profile.creation.title')}>
                    <Text mb="sm">{t('how.profile.creation.p1')}</Text>
                    <SimpleList items={t('how.profile.creation.list', { returnObjects: true })} />
                </Subsection>
                <Subsection title={t('how.profile.content.title')}>
                    <Text mb="sm">{t('how.profile.content.p1')}</Text>
                    <SimpleList items={t('how.profile.content.list', { returnObjects: true })} />
                    <Text mt="sm">{t('how.profile.content.p2')}</Text>
                </Subsection>
            </Stack>
        )
    }

    if (sectionKey === 'privacy') {
        return (
            <Stack gap="xl">
                <Subsection title={t('how.privacy.visibility.title')}>
                    <Text mb="sm">{t('how.privacy.visibility.p1')}</Text>
                    <SimpleList items={t('how.privacy.visibility.list1', { returnObjects: true })} />
                    <Text mt="md" mb="sm">{t('how.privacy.visibility.p2')}</Text>
                    <SimpleList items={t('how.privacy.visibility.list2', { returnObjects: true })} />
                </Subsection>
                <Subsection title={t('how.privacy.records.title')}>
                    <Text mb="sm">{t('how.privacy.records.p1')}</Text>
                    <SimpleList items={t('how.privacy.records.list', { returnObjects: true })} />
                    <Text mt="sm">{t('how.privacy.records.p2')}</Text>
                </Subsection>
            </Stack>
        )
    }

    if (sectionKey === 'vehicles') {
        return (
            <Stack gap="xl">
                <Subsection title={t('how.vehicles.registering.title')}>
                    <Text mb="sm">{t('how.vehicles.registering.p1')}</Text>
                    <Text mb="sm">{t('how.vehicles.registering.p2')}</Text>
                    <SimpleList items={t('how.vehicles.registering.list', { returnObjects: true })} />
                </Subsection>
                <Subsection title={t('how.vehicles.requirements.title')}>
                    <Text mb="sm">{t('how.vehicles.requirements.p1')}</Text>
                    <SimpleList items={t('how.vehicles.requirements.list', { returnObjects: true })} />
                    <Text mt="sm">{t('how.vehicles.requirements.p2')}</Text>
                </Subsection>
            </Stack>
        )
    }

    if (sectionKey === 'posting') {
        return (
            <Stack gap="xl">
                <Subsection title={t('how.posting.details.title')}>
                    <Text mb="sm">{t('how.posting.details.p1')}</Text>
                    <SimpleList items={t('how.posting.details.list', { returnObjects: true })} />
                    <Text mt="sm">{t('how.posting.details.p2')}</Text>
                </Subsection>
                <Subsection title={t('how.posting.location.title')}>
                    <Text mb="sm">{t('how.posting.location.p1')}</Text>
                    <SimpleList items={t('how.posting.location.list', { returnObjects: true })} />
                    <Text mt="sm">{t('how.posting.location.p2')}</Text>
                </Subsection>
            </Stack>
        )
    }

    if (sectionKey === 'rules') {
        return (
            <Stack gap="xl">
                <Subsection title={t('how.rules.luggage.title')}>
                    <Text>{t('how.rules.luggage.p1')}</Text>
                </Subsection>
                <Subsection title={t('how.rules.radius.title')}>
                    <Text mb="sm">{t('how.rules.radius.p1')}</Text>
                    <Text>{t('how.rules.radius.p2')}</Text>
                </Subsection>
                <Subsection title={t('how.rules.flexibility.title')}>
                    <Text>{t('how.rules.flexibility.p1')}</Text>
                </Subsection>
                <Subsection title={t('how.rules.payment.title')}>
                    <Text mb="sm">{t('how.rules.payment.p1')}</Text>
                    <Text mb="sm">{t('how.rules.payment.p2')}</Text>
                    <SimpleList items={t('how.rules.payment.list', { returnObjects: true })} />
                </Subsection>
                <Subsection title={t('how.rules.autoAccept.title')}>
                    <Text mb="sm">{t('how.rules.autoAccept.p1')}</Text>
                    <SimpleList items={t('how.rules.autoAccept.list1', { returnObjects: true })} />
                    <Text mt="md" mb="sm">{t('how.rules.autoAccept.p2')}</Text>
                    <SimpleList items={t('how.rules.autoAccept.list2', { returnObjects: true })} />
                </Subsection>
            </Stack>
        )
    }

    if (sectionKey === 'templates') {
        return (
            <Stack gap="xl">
                <Subsection title={t('how.templates.ruleTemplates.title')}>
                    <Text>{t('how.templates.ruleTemplates.p1')}</Text>
                </Subsection>
                <Subsection title={t('how.templates.tripTemplates.title')}>
                    <Text mb="sm">{t('how.templates.tripTemplates.p1')}</Text>
                    <Text>{t('how.templates.tripTemplates.p2')}</Text>
                </Subsection>
            </Stack>
        )
    }

    if (sectionKey === 'searching') {
        return (
            <Stack gap="xl">
                <Subsection title={t('how.searching.criteria.title')}>
                    <Text mb="sm">{t('how.searching.criteria.p1')}</Text>
                    <SimpleList items={t('how.searching.criteria.list', { returnObjects: true })} />
                </Subsection>
                <Subsection title={t('how.searching.ranking.title')}>
                    <Text mb="sm">{t('how.searching.ranking.p1')}</Text>
                    <SimpleList items={t('how.searching.ranking.list', { returnObjects: true })} />
                    <Text mt="sm">{t('how.searching.ranking.p2')}</Text>
                </Subsection>
            </Stack>
        )
    }

    if (sectionKey === 'booking') {
        return (
            <Stack gap="xl">
                <Subsection title={t('how.booking.states.title')}>
                    <Text mb="sm">{t('how.booking.states.p1')}</Text>
                    <SimpleList items={t('how.booking.states.list', { returnObjects: true })} />
                </Subsection>
                <Subsection title={t('how.booking.payment.title')}>
                    <Text>{t('how.booking.payment.p1')}</Text>
                </Subsection>
                <Subsection title={t('how.booking.visibility.title')}>
                    <Text mb="sm">{t('how.booking.visibility.p1')}</Text>
                    <SimpleList items={t('how.booking.visibility.list', { returnObjects: true })} />
                    <Text mt="sm">{t('how.booking.visibility.p2')}</Text>
                </Subsection>
            </Stack>
        )
    }

    if (sectionKey === 'managing') {
        return (
            <Stack gap="xl">
                <Subsection title={t('how.managing.control.title')}>
                    <Text mb="sm">{t('how.managing.control.p1')}</Text>
                    <SimpleList items={t('how.managing.control.list', { returnObjects: true })} />
                </Subsection>
                <Subsection title={t('how.managing.transparency.title')}>
                    <Text mb="sm">{t('how.managing.transparency.p1')}</Text>
                    <Text>{t('how.managing.transparency.p2')}</Text>
                </Subsection>
            </Stack>
        )
    }

    if (sectionKey === 'pickup') {
        return (
            <Stack gap="xl">
                <Subsection title={t('how.pickup.window.title')}>
                    <Text mb="sm">{t('how.pickup.window.p1')}</Text>
                    <SimpleList items={t('how.pickup.window.list', { returnObjects: true })} />
                </Subsection>
                <Subsection title={t('how.pickup.locations.title')}>
                    <Text mb="sm">{t('how.pickup.locations.p1')}</Text>
                    <Text>{t('how.pickup.locations.p2')}</Text>
                </Subsection>
            </Stack>
        )
    }

    if (sectionKey === 'lifecycle') {
        return (
            <Stack gap="xl">
                <Subsection title={t('how.lifecycle.flow.title')}>
                    <SimpleList items={t('how.lifecycle.flow.list', { returnObjects: true })} />
                </Subsection>
                <Subsection title={t('how.lifecycle.safeguards.title')}>
                    <Text mb="sm">{t('how.lifecycle.safeguards.p1')}</Text>
                    <SimpleList items={t('how.lifecycle.safeguards.list', { returnObjects: true })} />
                    <Text mt="sm">{t('how.lifecycle.safeguards.p2')}</Text>
                </Subsection>
            </Stack>
        )
    }

    if (sectionKey === 'notifications') {
        return (
            <Stack gap="xl">
                <Subsection title={t('how.notifications.inApp.title')}>
                    <Text>{t('how.notifications.inApp.p1')}</Text>
                </Subsection>
                <Subsection title={t('how.notifications.push.title')}>
                    <Text mb="sm">{t('how.notifications.push.p1')}</Text>
                    <SimpleList items={t('how.notifications.push.list', { returnObjects: true })} />
                </Subsection>
                <Subsection title={t('how.notifications.triggers.title')}>
                    <Text mb="sm">{t('how.notifications.triggers.p1')}</Text>
                    <SimpleList items={t('how.notifications.triggers.list', { returnObjects: true })} />
                </Subsection>
            </Stack>
        )
    }

    if (sectionKey === 'historySection') {
        return (
            <Stack gap="xl">
                <Subsection title={t('how.historySection.importance.title')}>
                    <Text mb="sm">{t('how.historySection.importance.p1')}</Text>
                    <Text>{t('how.historySection.importance.p2')}</Text>
                </Subsection>
                <Subsection title={t('how.historySection.retained.title')}>
                    <SimpleList items={t('how.historySection.retained.list', { returnObjects: true })} />
                </Subsection>
            </Stack>
        )
    }

    if (sectionKey === 'safety') {
        return (
            <Stack gap="xl">
                <Subsection title={t('how.safety.anonymous.title')}>
                    <Text>{t('how.safety.anonymous.p1')}</Text>
                </Subsection>
                <Subsection title={t('how.safety.sensitive.title')}>
                    <Text mb="sm">{t('how.safety.sensitive.p1')}</Text>
                    <SimpleList items={t('how.safety.sensitive.list', { returnObjects: true })} />
                </Subsection>
                <Subsection title={t('how.safety.automation.title')}>
                    <Text>{t('how.safety.automation.p1')}</Text>
                </Subsection>
            </Stack>
        )
    }

    if (sectionKey === 'expectations') {
        return (
            <Stack gap="xl">
                <Subsection title={t('how.expectations.notTaxi.title')}>
                    <Text mb="sm">{t('how.expectations.notTaxi.p1')}</Text>
                    <Text>{t('how.expectations.notTaxi.p2')}</Text>
                </Subsection>
                <Subsection title={t('how.expectations.abuse.title')}>
                    <Text>{t('how.expectations.abuse.p1')}</Text>
                </Subsection>
            </Stack>
        )
    }

    if (sectionKey === 'disclaimers') {
        return (
            <Stack gap="md">
                <Text mb="sm">{t('how.disclaimers.p1')}</Text>
                <SimpleList items={t('how.disclaimers.list', { returnObjects: true })} />
                <Text mt="sm">{t('how.disclaimers.p2')}</Text>
            </Stack>
        )
    }

    if (sectionKey === 'final') {
        return (
            <Stack gap="md">
                <Text mb="sm">{t('how.final.p1')}</Text>
                <SimpleList items={t('how.final.list', { returnObjects: true })} />
                <Text mt="sm" fw={600}>{t('how.final.p2')}</Text>
            </Stack>
        )
    }

    return null;
}

function Subsection({ title, children }: { title: string, children: React.ReactNode }) {
    return (
        <Box>
            <Title order={3} size="h4" mb="sm" c="blue.8">{title}</Title>
            {children}
        </Box>
    )
}

function SimpleList({ items }: { items: unknown }) {
    if (!Array.isArray(items)) return null;
    return (
        <List
            spacing="xs"
            size="md"
            center
            withPadding
        >
            {items.map((item, i) => (
                <List.Item key={i}>{item}</List.Item>
            ))}
        </List>
    );
}
