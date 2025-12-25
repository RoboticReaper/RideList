'use client'

import { IconSearch, IconArrowsSort, IconCalendarCheck } from '@tabler/icons-react';
import { Container, Text, Title, Grid, ThemeIcon, rem } from '@mantine/core';
import classes from './DriverSteps.module.css';

const data = [
	{
		title: 'Search',
		description:
			'Enter from, to, and time to see all available rides. No more scrolling through chats or comments.',
		icon: IconSearch,
	},
	{
		title: 'Compare',
		description:
			'Sort by price, driver rating, pickup time and distance. Filter with your own rules.',
		icon: IconArrowsSort,
	},
	{
		title: 'Book',
		description:
			'Reserve a spot with verified UIUC email and pay on time. All drivers are verified.',
		icon: IconCalendarCheck,
	},
];

export function DriverSteps() {
	return (
		<div className={classes.wrapper}>
			<Container>
				<Title className={classes.title}>Find Your Ride in 3 Steps</Title>

				<Container p={0}>
					<Text size="sm" className={classes.description}>
						Search, compare, and book. All in one place without requiring accounts
						up-front.
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
										Screenshot Placeholder
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