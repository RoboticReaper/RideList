'use client';

import { Paper, Group, Avatar, Text, Stack, Box, UnstyledButton } from '@mantine/core';
import { IconChevronRight } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

interface Rider {
    rider_id: string;
    rider_name: string;
    rider_photo_url: string | null;
    status: string;
}

interface ChatSubjectListProps {
    riders: Rider[];
    onSelect: (rider: Rider) => void;
}

export function ChatSubjectList({ riders, onSelect }: ChatSubjectListProps) {
    const { t } = useTranslation('common');

    // Filter unique riders based on rider_id
    const uniqueRiders = Array.from(new Map(riders.map(item => [item.rider_id, item])).values());

    if (uniqueRiders.length === 0) {
        return (
            <Text c="dimmed" fs="italic" ta="center" mt="xl">
                {t('tripDetails.chat.noMessages' as any)}
            </Text>
        );
    }

    return (
        <Stack gap={0}>
            {uniqueRiders.map((rider) => {
                return (
                    <UnstyledButton
                        key={rider.rider_id}
                        onClick={() => onSelect(rider)}
                        style={{ borderBottom: '1px solid var(--mantine-color-gray-2)' }}
                    >
                        <Paper p="md" bg="transparent">
                            <Group wrap="nowrap" align="center">
                                <Avatar src={rider.rider_photo_url} radius="xl" size="md" color="initials">
                                    {rider.rider_name?.charAt(0)}
                                </Avatar>

                                <Stack gap={2} style={{ flex: 1 }}>
                                    <Text fw={500} size="sm" lineClamp={1}>
                                        {rider.rider_name}
                                    </Text>
                                </Stack>

                                <IconChevronRight size={16} color="var(--mantine-color-gray-5)" />
                            </Group>
                        </Paper>
                    </UnstyledButton>
                );
            })}
        </Stack>
    );
}
