'use client'

import { IconSquarePlus, IconCalendar, IconCar } from '@tabler/icons-react';
import { Container, Text, Title, Grid, ThemeIcon, rem, Image } from '@mantine/core';
import classes from './DriverSteps.module.css';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '../LocalizedLink';

export function DriverSteps() {
	const { t, i18n } = useTranslation('common');

	const data = [
		{
			title: t('driverSteps.post'),
			description: t('driverSteps.postDesc'),
			icon: IconSquarePlus,
		},
		{
			title: t('driverSteps.manage'),
			description: t('driverSteps.manageDesc'),
			icon: IconCalendar,
		},
		{
			title: t('driverSteps.drive'),
			description: t('driverSteps.driveDesc'),
			icon: IconCar,
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
								<Title order={3} className={classes.stepTitle}>
									{item.title}
								</Title>
								<Text
									c="gray.1"
									className={classes.stepDescription}
									style={{ whiteSpace: 'pre-line' }}
								>
									{item.description}
								</Text>
							</Grid.Col>
							<Grid.Col span={{ base: 12, md: 6 }}>
								<Image
									src={`/demoPic/${i18n.language.startsWith('zh') ? 'zh' : 'en'}/driver step ${index + 1}.png`}
									alt={item.title}
									radius="md"
									className={classes.screenshot}
								/>
								<Text c="gray.3" size="xs" ta="center" mt="xs">
									{t(`driverSteps.captions.step${index + 1}` as any)}
								</Text>
							</Grid.Col>
						</Grid>
					))}
				</div>

				<Container p={0} mt="xl" style={{ textAlign: 'center' }}>
					<Text size="sm" mb="xs">
						{t('driverSteps.footer')}
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
							{t('driverSteps.howItWorksLink')}
						</LocalizedLink>
					</Title>
				</Container>
			</Container>
		</div>
	);
}