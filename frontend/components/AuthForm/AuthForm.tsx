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
  TextInput,
  Input,
} from '@mantine/core';
import { useTranslation, Trans } from 'react-i18next';
import { useForm } from '@mantine/form';
import { upperFirst, useToggle } from '@mantine/hooks';
import { MicrosoftButton } from './MicrosoftButton';
import { useEffect, useState } from 'react';
import { useAuth } from '../firebase/AuthContext';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { getLocalizedHref, LocalizedLink } from '../LocalizedLink';
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

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);

  const emailLogin = async () => {
    setEmailError(null);
    setPasswordError(null);

    if (!checked) {
      setError(t('auth.agreementsError'));
      return;
    }

    if (!email.trim()) {
      setEmailError(t('auth.emailRequired'));
      return;
    }

    if (!password) {
      setPasswordError(t('auth.passwordRequired'));
      return;
    }

    setEmailLoading(true);
    try {
      const result = await signInWithEmailAndPassword(auth, email.trim(), password);
      if (result) {
        if (returnUrl) {
          router.push(getLocalizedHref(params, returnUrl));
        } else {
          router.push(getLocalizedHref(params, "/dashboard"));
        }
      }
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/user-not-found' || code === 'auth/invalid-credential') {
        setEmailError(t('auth.invalidCredentials'));
      } else if (code === 'auth/wrong-password') {
        setPasswordError(t('auth.invalidCredentials'));
      } else if (code === 'auth/invalid-email') {
        setEmailError(t('auth.invalidEmail'));
      } else if (code === 'auth/too-many-requests') {
        setEmailError(t('auth.tooManyAttempts'));
      } else {
        setEmailError(t('auth.loginFailed'));
      }
    } finally {
      setEmailLoading(false);
    }
  };

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
    <Paper radius="md" p="lg" withBorder {...props} maw={400} mt="xl">
      <Text size="lg" fw={500}>
        {t('auth.loginWelcome')}
      </Text>

      <Group grow mb="md" mt="md">
        <MicrosoftButton radius="xl" onClick={msLogin}>Microsoft</MicrosoftButton>
      </Group>

      {(process.env.NODE_ENV === 'development') &&
        <>
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
        </>
      }

      <Text size="xs" mb="md">
        {t('auth.uiucOnly')}
      </Text>

      <Divider
        label={t('auth.communityDriversOnly')}
        labelPosition="center"
        my="lg"
        styles={{ label: { color: 'var(--mantine-color-dimmed)', fontSize: 'var(--mantine-font-size-xs)' } }}
      />

      <form onSubmit={(e) => { e.preventDefault(); emailLogin(); }}>
        <Stack gap="xs">
          <TextInput
            required
            label={t('auth.emailLabel')}
            placeholder={t('auth.emailPlaceholder')}
            value={email}
            onChange={(e) => { setEmail(e.currentTarget.value); setEmailError(null); }}
            error={emailError}
            radius="md"
            size="sm"
          />

          <PasswordInput
            required
            label={t('auth.passwordLabel')}
            placeholder={t('auth.passwordPlaceholder')}
            value={password}
            onChange={(e) => { setPassword(e.currentTarget.value); setPasswordError(null); }}
            error={passwordError}
            radius="md"
            size="sm"
          />

          <Button
            type="submit"
            radius="xl"
            loading={emailLoading}
            fullWidth
            variant="light"
            size="sm"
          >
            {t('auth.loginWithEmail')}
          </Button>
        </Stack>
      </form>

      <Input.Wrapper label={t('auth.agreementsLabel')} withAsterisk error={error} mt="md">
        <Checkbox
          label={
            <Trans
              i18nKey="auth.agreementsCheckbox"
              components={{
                1: <Anchor component={LocalizedLink} href="/privacy" inherit c="blue" />,
                3: <Anchor component={LocalizedLink} href="/tos" inherit c="blue" />
              }}
            />
          }
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