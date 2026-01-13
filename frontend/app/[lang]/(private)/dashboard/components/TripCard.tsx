import { Card, Text, Badge, Group, Stack, Button, Flex, Alert, Anchor } from '@mantine/core';
import { getTripStatusConfig } from '@/utils/statusUtils';
import { IconMapPin, IconCalendar, IconUsers, IconSteeringWheel, IconAlertTriangle, IconShare } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import dayjs, { CHICAGO_TZ } from '@/utils/dateUtils';
import { LocalizedLink } from '@/components/LocalizedLink';
import { useTranslation, Trans } from 'react-i18next';

interface Trip {
    // ... existing interface

    id: string;
    from_text: string;
    to_text: string;
    departure_time: string;
    status: 'bookable' | 'full' | 'departed' | 'done' | 'cancelled' | 'locked' | 'aborted';
    seats_taken: number;
    total_seats: number;
    price: string;
    make?: string;
    model?: string;
    plate?: string;
    color?: string;
    start_check_in?: boolean;
    driver_phone?: string;
    driver_id?: string;
    from_input_text?: string;
    to_input_text?: string;
    car_id?: string;
}

interface TripCardProps {
    trip: Trip;
}

export function TripCard({ trip }: TripCardProps) {
    const { t } = useTranslation('common');


    return (
        <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Stack gap="md">
                {/* Header: Route and Status */}
                <Flex justify="space-between" align="start" direction={{ base: 'column', sm: 'row' }} gap="xs">
                    <Stack gap={4}>
                        <Group gap="xs">
                            <IconMapPin size={18} style={{ color: 'var(--mantine-color-blue-6)' }} />
                            <Text fw={600} size="lg" lineClamp={1} title={trip.from_input_text}>
                                {trip.from_input_text?.split(',')[0]}
                            </Text>
                            <Text size="lg" c="dimmed">
                                &rarr;
                            </Text>
                            <Text fw={600} size="lg" lineClamp={1} title={trip.to_input_text}>
                                {trip.to_input_text?.split(',')[0]}
                            </Text>
                        </Group>
                        <Text size="xs" c="dimmed" ml={28}>
                            {trip.from_input_text} &rarr; {trip.to_input_text}
                        </Text>
                    </Stack>
                    <Group gap="xs">
                        <Badge color={getTripStatusConfig(trip.status).color} variant="light">
                            {t(getTripStatusConfig(trip.status).labelKey).toUpperCase()}
                        </Badge>
                        {trip.status !== "done" && trip.status !== "cancelled" && trip.start_check_in && (
                            <Badge color="cyan" variant="light">
                                {t('dashboard.tripCard.checkInStarted')}
                            </Badge>
                        )}
                    </Group>
                </Flex>

                <Card.Section withBorder inheritPadding py="xs">
                    <Group justify="space-between">
                        {/* Date & Time */}
                        <Group gap="xs">
                            <IconCalendar size={16} />
                            <Text size="sm">
                                {dayjs(trip.departure_time).tz(CHICAGO_TZ).format('MMM D, YYYY h:mm A')}
                            </Text>
                        </Group>

                        {/* Seats */}
                        <Group gap="xs">
                            <IconUsers size={16} />
                            <Text size="sm">
                                {trip.total_seats - trip.seats_taken} / {trip.total_seats} {t('dashboard.tripCard.seatsLeft')}
                            </Text>
                        </Group>
                    </Group>
                </Card.Section>

                {/* Car Info */}
                {(trip.make || trip.model) && (
                    <Group gap="xs" c="dimmed">
                        <IconSteeringWheel size={16} />
                        <Text size="sm">
                            {trip.color} {trip.make} {trip.model} • {trip.plate}
                        </Text>
                    </Group>
                )}

                {/* Validation Warnings */}
                {(!trip.driver_phone || !trip.make) && trip.status !== 'cancelled' && (
                    <Stack gap="xs">
                        {!trip.driver_phone && (
                            <Alert color="red" variant="light" title={t('dashboard.tripCard.actionRequired')} icon={<IconAlertTriangle size={16} />}>
                                <Trans i18nKey="dashboard.tripCard.driverPhoneRequired" components={{ 1: <Anchor component={LocalizedLink} href={`/profile/${trip.driver_id}`} style={{ textDecoration: 'underline' }} /> }} />
                            </Alert>
                        )}
                        {!trip.car_id && (
                            <Alert color="red" variant="light" title={t('dashboard.tripCard.actionRequired')} icon={<IconAlertTriangle size={16} />}>
                                <Trans i18nKey="dashboard.tripCard.carRequired" components={{ 1: <Anchor component={LocalizedLink} href={`/dashboard/${trip.id}?tab=edit`} style={{ textDecoration: 'underline' }} /> }} />
                            </Alert>
                        )}
                    </Stack>
                )}

                <Button component={LocalizedLink} href={`/dashboard/${trip.id}`} variant="light" fullWidth mt="xs">
                    {t('dashboard.tripCard.manageTrip')}
                </Button>
                <Button
                    variant="subtle"
                    fullWidth
                    leftSection={<IconShare size={16} />}
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();

                        const shareText = t('rides.errors.share.text', {
                            from: trip.from_input_text || trip.from_text,
                            to: trip.to_input_text || trip.to_text,
                            time: dayjs(trip.departure_time).tz(CHICAGO_TZ).format('MMM D, YYYY h:mm A'),
                            link: `${window.location.origin}/rides/${trip.id}`
                        });

                        navigator.clipboard.writeText(shareText);
                        notifications.show({
                            title: t('rides.errors.successTitle'),
                            message: t('rides.errors.share.copied'),
                            color: 'green'
                        });
                    }}
                >
                    {t('rides.errors.share.button')}
                </Button>
            </Stack>
        </Card>
    );
}
