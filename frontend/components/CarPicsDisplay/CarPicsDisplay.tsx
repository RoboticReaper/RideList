'use client';

import { useState } from 'react';
import { Image, Modal, Group, ActionIcon, Box, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';

interface CarPicsDisplayProps {
    pics: (string | null | undefined)[];
    thumbnailHeight?: number;
    thumbnailWidth?: number | string;
    radius?: string;
}

/**
 * Displays a car picture thumbnail. Clicking it opens a modal carousel
 * that lets the user scroll through all non-null pictures.
 */
export default function CarPicsDisplay({ pics, thumbnailHeight = 60, thumbnailWidth = 80, radius = 'md' }: CarPicsDisplayProps) {
    const validPics = pics.filter((p): p is string => !!p);
    const [opened, { open, close }] = useDisclosure(false);
    const [activeIndex, setActiveIndex] = useState(0);

    if (validPics.length === 0) return null;

    const prev = () => setActiveIndex((i) => (i - 1 + validPics.length) % validPics.length);
    const next = () => setActiveIndex((i) => (i + 1) % validPics.length);

    return (
        <>
            <Box
                style={{ cursor: 'pointer', position: 'relative', display: 'inline-block' }}
                onClick={open}
            >
                <Image
                    src={validPics[0]}
                    alt="Car"
                    radius={radius}
                    h={thumbnailHeight}
                    w={thumbnailWidth}
                    fit="cover"
                />
                {validPics.length > 1 && (
                    <Text
                        size="xs"
                        c="white"
                        fw={700}
                        style={{
                            position: 'absolute', bottom: 4, right: 4,
                            background: 'rgba(0,0,0,0.6)', borderRadius: 4,
                            padding: '0 4px', lineHeight: '18px'
                        }}
                    >
                        +{validPics.length - 1}
                    </Text>
                )}
            </Box>

            <Modal opened={opened} onClose={close} size="lg" centered withCloseButton padding="sm">
                <Box style={{ position: 'relative', minHeight: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Image
                        src={validPics[activeIndex]}
                        alt={`Car photo ${activeIndex + 1}`}
                        radius="md"
                        fit="contain"
                        mah="70vh"
                    />
                    {validPics.length > 1 && (
                        <>
                            <ActionIcon
                                variant="filled" color="dark" radius="xl" size="lg"
                                style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)' }}
                                onClick={prev}
                            >
                                <IconChevronLeft size={20} />
                            </ActionIcon>
                            <ActionIcon
                                variant="filled" color="dark" radius="xl" size="lg"
                                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)' }}
                                onClick={next}
                            >
                                <IconChevronRight size={20} />
                            </ActionIcon>
                        </>
                    )}
                </Box>
                {validPics.length > 1 && (
                    <Text size="xs" c="dimmed" ta="center" mt="xs">
                        {activeIndex + 1} / {validPics.length}
                    </Text>
                )}
            </Modal>
        </>
    );
}
