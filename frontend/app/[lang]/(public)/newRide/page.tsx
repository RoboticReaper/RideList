'use client'

import { TripInputBar } from '@/components/TripInputBar/TripInputBar';
import { Container, Title } from '@mantine/core';

export default function NewRidePage() {
    return (
        <Container size="xl" py="xl">
            <Title order={2} mb="lg">Post a New Ride</Title>
            <TripInputBar />
        </Container>
    );
}