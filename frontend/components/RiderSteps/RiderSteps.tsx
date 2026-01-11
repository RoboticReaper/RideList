'use client'

import { IconSearch, IconArrowsSort, IconCalendarCheck } from '@tabler/icons-react';
import { Container, Text, Title, Grid, ThemeIcon, rem, Image } from '@mantine/core';
import classes from './RiderSteps.module.css';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '../LocalizedLink';

export function RiderSteps() {
	const { t, i18n } = useTranslation('common');

	const data = [
		{
			title: t('riderSteps.search'),
			description: t('riderSteps.searchDesc'),
			icon: IconSearch,
		},
		{
			title: t('riderSteps.compare'),
			description: t('riderSteps.compareDesc'),
			icon: IconArrowsSort,
		},
		{
			title: t('riderSteps.book'),
			description: t('riderSteps.bookDesc'),
			icon: IconCalendarCheck,
		},
	];

	return (
		<Container className={classes.wrapper}>
			<Title className={classes.title}>{t('riderSteps.title')}</Title>

			<Container p={0}>
				<Text size="sm" className={classes.description}>
					{t('riderSteps.description')}
				</Text>
			</Container>

			<div className={classes.stepsWrapper}>
				{data.map((item, index) => (
					<Grid key={index} gutter={50} className={classes.stepRow}>
						<Grid.Col span={{ base: 12, md: 6 }}>
							<ThemeIcon size={44} radius="md" variant="light" mb="sm">
								<item.icon
									style={{ width: rem(24), height: rem(24) }}
									stroke={1.5}
								/>
							</ThemeIcon>
							<Title order={3} className={classes.stepTitle}>
								{item.title}
							</Title>
							<Text
								c="dimmed"
								className={classes.stepDescription}
								style={{ whiteSpace: 'pre-line' }}
							>
								{item.description}
							</Text>
						</Grid.Col>
						<Grid.Col span={{ base: 12, md: 6 }}>
							<Image
								src={`/demoPic/${i18n.language.startsWith('zh') ? 'zh' : 'en'}/rider step ${index + 1}.png`}
								alt={item.title}
								radius="md"
								className={classes.screenshot}
							/>
							<Text c="dimmed" size="xs" ta="center" mt="xs">
								{t(`riderSteps.captions.step${index + 1}` as any)}
							</Text>
						</Grid.Col>
					</Grid>
				))}
			</div>

			<Container p={0} mt="xl" style={{ textAlign: 'center' }}>
				<Text c="dimmed" size="sm" mb="xs">
					{t('riderSteps.footer')}
				</Text>
				<Title order={4} size="sm">
					<LocalizedLink
						href="/how"
						style={{
							textDecoration: 'none',
							color: 'inherit',
							fontWeight: 600,
						}}
					>
						{t('riderSteps.howItWorksLink')}
					</LocalizedLink>
				</Title>
			</Container>
		</Container>
	);
}