import { Button, Container, Text, Title, List, ListItem, Group } from '@mantine/core';
import classes from './Hero.module.css';
import { useServerTranslation } from '@/app/i18n/server';
import { LocalizedLink } from '../LocalizedLink';

type Props = {
  lang: string;
};

export async function Hero({ lang }: Props) {
  const { t } = await useServerTranslation(lang, 'common')

  return (
    <div className={classes.root}>
      <Container size="lg">
        <div className={classes.inner}>
          <div className={classes.content}>
            <Title className={classes.title}>
              {t('hero.title1')}
              <Text
                component="span"
                inherit
                className={classes.titleAccent}
              >
                {t('hero.titleColored')}
              </Text>
              {t('hero.title2')}
            </Title>

            <Text className={classes.description} mt={30}>
              {t('hero.description')}
            </Text>

            <List className={classes.list} mt={20}>
              <ListItem>{t('hero.list1')}</ListItem>
              <ListItem>{t('hero.list2')}</ListItem>
              <ListItem>{t('hero.list3')}</ListItem>
            </List>

            <Group mt={40}>
              <Button
                component={LocalizedLink}
                href="/rides"
                variant="gradient"
                gradient={{ from: 'pink', to: 'yellow' }}
                size="xl"
                className={classes.control}
              >
                {t('hero.actionTxt')}
              </Button>

              <Button
                component={LocalizedLink}
                href="/dashboard"
                size="xl"
                className={classes.secondaryControl}
              >
                {t('hero.dashboardBtn')}
              </Button>
            </Group>
          </div>
        </div>
      </Container>
    </div>
  );
}