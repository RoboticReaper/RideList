'use client'

import { IconSearch, IconArrowsSort, IconCalendarCheck } from '@tabler/icons-react';
import { Container, Text, Title, Grid, ThemeIcon, rem } from '@mantine/core';
import classes from './DriverSteps.module.css';
import { useTranslation } from 'react-i18next';

export function DriverSteps() {
	const { t } = useTranslation('common');

	const data = [
		{
			title: t('driverSteps.search'),
			description: t('driverSteps.searchDesc'),
			icon: IconSearch,
		},
		{
			title: t('driverSteps.compare'),
			description: t('driverSteps.compareDesc'),
			icon: IconArrowsSort,
		},
		{
			title: t('driverSteps.book'),
			description: t('driverSteps.bookDesc'),
			icon: IconCalendarCheck,
		},
	];

	return (
		<div className={classes.wrapper}>
			<Container>
				<Title className={classes.title}>{t('driverSteps.title')}</Title>

				<Container p={0}>
					<Text size="sm" className={classes.description}>
						{t('driverSteps.description')}
					</Text>
				</Container>

				<div className={classes.stepsWrapper}>
					{data.map((item, index) => (
						<Grid key={index} gutter={50} className={classes.stepRow}>
							<Grid.Col span={{ base: 12, md: 6 }}>
								<ThemeIcon size={44} radius="md" variant="white" mb="sm">
									<item.icon
										style={{ width: rem(24), height: rem(24) }}
										stroke={1.5}
									/>
								</ThemeIcon>
								<Title order={2} className={classes.stepTitle}>
									{item.title}
								</Title>
								<Text c="gray.1" className={classes.stepDescription}>
									{item.description}
								</Text>
							</Grid.Col>
							<Grid.Col span={{ base: 12, md: 6 }}>
								<div className={classes.screenshotPlaceholder}>
									<Text c="gray.3" size="sm">
										{t('driverSteps.screenshotPlaceholder')}
									</Text>
								</div>
							</Grid.Col>
						</Grid>
					))}
				</div>
			</Container>
		</div>
	);
}