'use client'
import {
  Anchor,
  Button,
  Checkbox,
  Divider,
  Group,
  Paper,
  PaperProps,
  PasswordInput,
  Stack,
  Text,
  Input,
} from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useForm } from '@mantine/form';
import { upperFirst, useToggle } from '@mantine/hooks';
import { MicrosoftButton } from './MicrosoftButton';
import { useEffect, useState } from 'react';
import { useAuth } from '../firebase/AuthContext';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { getLocalizedHref } from '../LocalizedLink';
import { signInWithUIUC } from '../firebase/AuthContext';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { getAuth } from 'firebase/auth';
import { app } from '../firebase/firebase';


export function AuthForm(props: PaperProps) {
  const { t } = useTranslation('common');
  const [checked, setChecked] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { user, loading } = useAuth()
  const router = useRouter()
  const params = useParams();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get('returnUrl');
  const auth = getAuth(app);

  const msLogin = () => {
    if (!checked) {
      setError(t('auth.agreementsError'))
      return
    }

    signInWithUIUC().then((success) => {
      if (success) {
        if (returnUrl) {
          router.push(getLocalizedHref(params, returnUrl));
        } else {
          router.push(getLocalizedHref(params, "/dashboard"));
        }
      }
    })

  }

  useEffect(() => {
    if (user) {
      if (returnUrl) {
        router.replace(getLocalizedHref(params, returnUrl));
      } else {
        router.replace(getLocalizedHref(params, "/dashboard"));
      }
    }
  }, [user, router, params, returnUrl])

  return (
    <Paper radius="md" p="lg" withBorder {...props} maw={400}>
      <Text size="lg" fw={500}>
        {t('auth.loginWelcome')}
      </Text>

      <Group grow mb="md" mt="md">
        <MicrosoftButton radius="xl" onClick={msLogin}>Microsoft</MicrosoftButton>
      </Group>

      <Text size="xs" mb="md">
        {t('auth.uiucOnly')}
      </Text>

      <Button
        radius="xl"
        onClick={() => {
          signInWithEmailAndPassword(auth, "liubaoren2006@gmail.com", "asdfasdf").then((success) => {
            if (success) {
              if (returnUrl) {
                router.push(getLocalizedHref(params, returnUrl));
              } else {
                router.push(getLocalizedHref(params, "/dashboard"));
              }
            }
          })
        }}
      >
        {t('auth.testerLogin')} 1
      </Button>
      <Button
        radius="xl"
        onClick={() => {
          signInWithEmailAndPassword(auth, "baowenliu2019@gmail.com", "asdfasdf").then((success) => {
            if (success) {
              if (returnUrl) {
                router.push(getLocalizedHref(params, returnUrl));
              } else {
                router.push(getLocalizedHref(params, "/dashboard"));
              }
            }
          })
        }}
      >
        {t('auth.testerLogin')} 2
      </Button>
      <Button
        radius="xl"
        onClick={() => {
          signInWithEmailAndPassword(auth, "liubaoren2006.2@gmail.com", "asdfasdf").then((success) => {
            if (success) {
              if (returnUrl) {
                router.push(getLocalizedHref(params, returnUrl));
              } else {
                router.push(getLocalizedHref(params, "/dashboard"));
              }
            }
          })
        }}
      >
        {t('auth.testerLogin')} 3
      </Button>

      <Input.Wrapper label={t('auth.agreementsLabel')} withAsterisk error={error}>
        <Checkbox
          label={t('auth.agreementsCheckbox')}
          mt="xs"
          mb={error ? 'xs' : undefined}
          checked={checked}
          onChange={(event) => {
            setChecked(event.currentTarget.checked)
            setError(null)
          }}
        />
      </Input.Wrapper>

    </Paper>
  );
}