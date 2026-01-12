'use client';

import { Container, Title, Text, List, Stack, ThemeIcon, Box } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { IconCircle } from '@tabler/icons-react';

const SECTION_KEYS = [
    'effectiveDate',
    'platform',
    'eligibility',
    'roles',
    'vehicles',
    'tripCreation',
    'booking',
    'automation',
    'privacy',
    'safety',
    'suspension',
    'liability',
    'changes',
    'contact'
];

export default function TosPage() {
    const { t } = useTranslation('common');

    return (
        <Container size="md" py="xl">
            <Stack gap="xl">
                <Title order={1} ta="center" mb="lg">
                    {t('tos.title')}
                </Title>

                {SECTION_KEYS.map((key) => (
                    <TosSection key={key} sectionKey={key} />
                ))}
            </Stack>
        </Container>
    );
}

function TosSection({ sectionKey }: { sectionKey: string }) {
    const { t } = useTranslation('common');
    const sectionPath = `tos.sections.${sectionKey}`;

    // Check if section exists by checking title
    // i18next returns the key if not found
    const title = t(`${sectionPath}.title` as any);
    if (title === `${sectionPath}.title`) return null;

    // Get body if it's a direct section (like effectiveDate)
    const directBody = t(`${sectionPath}.body` as any, { returnObjects: true });

    // Get subsections if they exist
    const subsections = t(`${sectionPath}.subsections` as any, { returnObjects: true });

    return (
        <Stack gap="md" id={sectionKey}>
            <Title order={2} size="h2">{title}</Title>

            {Array.isArray(directBody) && <BodyContent content={directBody} />}

            {Array.isArray(subsections) && subsections.map((sub: any, index: number) => (
                <Stack key={index} gap="sm" mt="sm">
                    {sub.title && <Title order={3} size="h3">{sub.title}</Title>}
                    <BodyContent content={sub.body} />
                </Stack>
            ))}
        </Stack>
    );
}

function BodyContent({ content }: { content: any[] }) {
    if (!Array.isArray(content)) return null;

    return (
        <Box>
            {content.map((item, index) => {
                if (typeof item === 'string') {
                    return <Text key={index} mb="sm" lh={1.6}>{item}</Text>;
                }

                if (typeof item === 'object' && item.type === 'list' && Array.isArray(item.items)) {
                    return (
                        <List
                            key={index}
                            spacing="xs"
                            size="md"
                            mb="sm"
                            withPadding
                            icon={
                                <ThemeIcon color="gray" variant="light" size={20} radius="xl">
                                    <IconCircle size={8} fill="currentColor" />
                                </ThemeIcon>
                            }
                        >
                            {item.items.map((li: string, i: number) => (
                                <List.Item key={i}>{li}</List.Item>
                            ))}
                        </List>
                    );
                }
                return null;
            })}
        </Box>
    );
}
