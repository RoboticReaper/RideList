'use client';

import {
    Container,
    Grid,
    Title,
    Text,
    List,
    Paper,
    Group,
    Stack,
    Box,
    rem,
    ThemeIcon,
    Divider,
    ScrollArea,
    Collapse,
    UnstyledButton,
} from '@mantine/core';
import { useTranslation } from 'react-i18next';
import {
    IconCheck,
    IconShieldCheck,
    IconInfoCircle,
    IconChevronDown,
    IconList,
    IconArrowRight
} from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useDisclosure, useMediaQuery } from '@mantine/hooks';
import { LocalizedLink } from '@/components/LocalizedLink';
import classes from './trust.module.css';

const SECTION_KEYS = [
    'intro',
    'who',
    'identity',
    'location',
    'pickup',
    'payments',
    'automation',
    'disputes',
    'expectations',
    'not',
    'unsafe',
] as const;

export default function TrustSafetyPage() {
    const { t } = useTranslation('common');
    const [activeSection, setActiveSection] = useState<string>('');
    const [mobileTocOpened, { toggle: toggleMobileToc }] = useDisclosure(false);
    const isMobile = useMediaQuery('(max-width: 992px)');

    useEffect(() => {
        const handleScroll = () => {
            const scrollPosition = window.scrollY + 200; // Increased offset for better detection
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
                setTimeout(scrollAction, 300);
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
                    {t(`trust.${key}.title` as any)}
                </Box>
            ))}
        </Stack>
    );

    return (
        <Container size="lg" py="xl">
            {/* Mobile TOC */}
            <Box
                mb="xl"
                hiddenFrom="md"
                style={{
                    position: 'sticky',
                    top: 60,
                    zIndex: 95,
                    backgroundColor: 'var(--mantine-color-body)',
                    marginLeft: -16,
                    marginRight: -16,
                    paddingLeft: 16,
                    paddingRight: 16,
                    paddingTop: 10,
                    paddingBottom: 10,
                    borderBottom: '1px solid var(--mantine-color-gray-2)'
                }}
            >
                <UnstyledButton onClick={toggleMobileToc} w="100%">
                    <Group justify="space-between">
                        <Group gap="xs">
                            <IconList size={18} />
                            <Text fw={600}>{t('trust.toc', 'On this page')}</Text>
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
            </Box>

            <Grid gutter={{ base: 'md', md: 50 }}>
                <Grid.Col span={{ base: 12, md: 4 }} visibleFrom="md">
                    <Box style={{ position: 'sticky', top: 100 }}>
                        <Title order={4} mb="md" pl="sm" c="dimmed" tt="uppercase" fz="sm" style={{ letterSpacing: '1px' }}>{t('trust.toc', 'On this page')}</Title>
                        <TocContent />
                    </Box>
                </Grid.Col>

                <Grid.Col span={{ base: 12, md: 8 }}>

                    <Stack gap="xl" mb={60}>
                        <Group gap="sm">
                            <ThemeIcon size={40} radius="md" variant="light" color="blue">
                                <IconShieldCheck size={24} />
                            </ThemeIcon>
                            <Title order={1} size="3rem" fw={900} fz={{ base: '2rem', md: '3rem' }}>
                                {t('trust.title')}
                            </Title>
                        </Group>
                    </Stack>

                    <Stack gap={80}>
                        {SECTION_KEYS.map((key) => (
                            <section id={key} key={key} style={{ scrollMarginTop: '100px' }}>
                                <TrustSectionContent sectionKey={key} />
                            </section>
                        ))}

                        <Paper withBorder p="xl" radius="md" bg="blue.0" mt="xl">
                            <Stack align="center" gap="md">
                                <Title order={3} ta="center">{t('trust.cta.title')}</Title>
                                <LocalizedLink href="/how">
                                    <Group gap="xs" c="blue" style={{ cursor: 'pointer' }}>
                                        <Text fw={600} td="underline">{t('trust.cta.link')}</Text>
                                    </Group>
                                </LocalizedLink>
                            </Stack>
                        </Paper>
                    </Stack>

                </Grid.Col>
            </Grid>
        </Container>
    );
}

function TrustSectionContent({ sectionKey }: { sectionKey: string }) {
    const { t } = useTranslation('common');

    // Helper to get anchor link from translation
    const getLinkHref = (text: string) => {
        if (text.includes("Getting started")) return "/how#who";
        if (text.includes("Profiles & privacy")) return "/how#identity"; // Mapped loosely to profile/privacy
        if (text.includes("Location handling")) return "/how#location"; // Mapped from common.json context
        if (text.includes("Booking lifecycle")) return "/how#booking";
        if (text.includes("System behavior")) return "/how#automation"; // Mapped from context
        return "/how";
    };

    // Correct mapping based on the actual translation keys structure I wrote
    const sectionConfig: Record<string, string> = {
        'who': '/how#who',
        'identity': '/how#profile', // privacy-aware -> profile/privacy
        'location': '/how#posting', // location privacy -> posting/location
        'payments': '/how#booking',
        'automation': '/how#lifecycle', // system protection -> lifecycle
    };

    // We parse the exact translation to find the " -> " part if needed, 
    // but the user instruction said "Each link should point to a specific anchor". 
    // I made a helper map above roughly based on content.
    // However, the translation string itself is "Learn more ... -> Section Name".
    // I will hardcode the hrefs based on logical mapping to `how` sections.

    const renderLink = (linkText: string | undefined, key: string) => {
        if (!linkText) return null;

        let href = '/how';
        if (key === 'who') href = '/how#who';
        if (key === 'identity') href = '/how#profile'; // or privacy
        if (key === 'location') href = '/how#posting'; // Location handling is in posting -> location? Or maybe privacy.
        // Let's look at How page again. 
        // who -> who
        // profile -> profile
        // privacy -> privacy
        // vehicles -> vehicles
        // posting -> posting
        // searching -> searching
        // booking -> booking
        // managing -> managing
        // pickup -> pickup
        // lifecycle -> lifecycle
        // notifications -> notifications
        // historySection -> historySection
        // safety -> safety
        // expectations -> expectations
        // disclaimers -> disclaimers

        // Refined mapping:
        if (key === 'who') href = '/how#who';
        if (key === 'identity') href = '/how#profile';
        if (key === 'location') href = '/how#posting';
        if (key === 'payments') href = '/how#booking';
        if (key === 'automation') href = '/how#lifecycle';

        return (
            <LocalizedLink href={href} >
                <Group gap={6} mt="md" c="blue" style={{ cursor: 'pointer', width: 'fit-content' }}>
                    <IconInfoCircle size={18} />
                    <Text size="sm" fw={600} td="underline">{linkText}</Text>
                </Group>
            </LocalizedLink>
        )
    }

    if (sectionKey === 'intro') {
        return (
            <Box>
                <Title order={2} mb="md">{t(`trust.${sectionKey}.title` as any)}</Title>
                <Text size="lg" lh={1.6}>{t(`trust.${sectionKey}.p1` as any)}</Text>
            </Box>
        );
    }

    // Generic list items helper
    const listItems = t(`trust.${sectionKey}.list` as any, { returnObjects: true }) as string[];
    // Some sections have list1, list2
    const list1 = t(`trust.${sectionKey}.list1` as any, { returnObjects: true }) as string[];
    const list2 = t(`trust.${sectionKey}.list2` as any, { returnObjects: true }) as string[];

    const p1 = t(`trust.${sectionKey}.p1` as any) as string;
    const p2 = t(`trust.${sectionKey}.p2` as any) as string;
    const p3 = t(`trust.${sectionKey}.p3` as any) as string;
    const p4 = t(`trust.${sectionKey}.p4` as any) as string;
    const link = t(`trust.${sectionKey}.link` as any) as string;

    // Check if key exists (if it returns the key, it doesn't exist)
    const hasP1 = p1 !== `trust.${sectionKey}.p1`;
    const hasP2 = p2 !== `trust.${sectionKey}.p2`;
    const hasP3 = p3 !== `trust.${sectionKey}.p3`;
    const hasP4 = p4 !== `trust.${sectionKey}.p4`;
    const hasLink = link !== `trust.${sectionKey}.link`;

    return (
        <Stack gap="md">
            <Group gap="xs">
                {(sectionKey === 'who' || sectionKey === 'identity' || sectionKey === 'location') &&
                    <ThemeIcon variant="transparent" color="blue"><IconShieldCheck size={28} /></ThemeIcon>
                }
                <Title order={2}>{t(`trust.${sectionKey}.title` as any)}</Title>
            </Group>

            {hasP1 && <Text lh={1.6}>{p1}</Text>}

            {Array.isArray(listItems) && (
                <List
                    spacing="sm"
                    size="md"
                    center
                    icon={
                        <ThemeIcon color="green.6" size={24} radius="xl" variant="light">
                            <IconCheck style={{ width: rem(14), height: rem(14) }} />
                        </ThemeIcon>
                    }
                >
                    {listItems.map((item: string, i: number) => (
                        <List.Item key={i}>{item}</List.Item>
                    ))}
                </List>
            )}

            {Array.isArray(list1) && (
                <List spacing="sm" size="md" center
                    icon={<ThemeIcon color="gray.5" size={24} radius="xl" variant="light"><IconCheck style={{ width: rem(14), height: rem(14) }} /></ThemeIcon>}
                >
                    {list1.map((item: string, i: number) => <List.Item key={i}>{item}</List.Item>)}
                </List>
            )}

            {hasP2 && <Text lh={1.6} fw={sectionKey === 'location' ? 400 : 500}>{p2}</Text>}

            {Array.isArray(list2) && (
                <List spacing="sm" size="md" center
                    icon={<ThemeIcon color="gray.5" size={24} radius="xl" variant="light"><IconCheck style={{ width: rem(14), height: rem(14) }} /></ThemeIcon>}
                >
                    {list2.map((item: string, i: number) => <List.Item key={i}>{item}</List.Item>)}
                </List>
            )}

            {hasP3 && <Text lh={1.6}>{p3}</Text>}
            {hasP4 && <Text lh={1.6}>{p4}</Text>}

            {hasLink && renderLink(link, sectionKey)}
        </Stack>
    );
}
