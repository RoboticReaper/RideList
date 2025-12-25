import { Button, Container, Text, Title, List, ListItem } from '@mantine/core';
import classes from './Hero.module.css';
import { useServerTranslation } from '@/app/i18n/server';

type Props = {
  lang: string;
};

export async function Hero({lang}: Props) {
    const {t} = await useServerTranslation(lang, 'common')

  return (
    <div className={classes.root}>
      <Container size="lg">
        <div className={classes.inner}>
          <div className={classes.content}>
            <Title className={classes.title }>
              {t('hero.title1')}
              <Text
                component="span"
                inherit
                variant="gradient"
                gradient={{ from: 'pink', to: 'yellow' }}
              >
                {t('hero.titleColored')}
              </Text>
              {t('hero.title2')}
            </Title>

            <Text className={classes.description} mt={30}>
              {t('hero.description')}
            </Text>

            <List className={classes.description} mt={20}>
                <ListItem>{t('hero.list1')}</ListItem>
                <ListItem>{t('hero.list2')}</ListItem>
                <ListItem>{t('hero.list3')}</ListItem>
            </List>

            <Button
              variant="gradient"
              gradient={{ from: 'pink', to: 'yellow' }}
              size="xl"
              className={classes.control}
              mt={40}
            >
              {t('hero.actionTxt')}
            </Button>
          </div>
        </div>
      </Container>
    </div>
  );
}