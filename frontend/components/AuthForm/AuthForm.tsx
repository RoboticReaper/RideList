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
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { upperFirst, useToggle } from '@mantine/hooks';
import { MicrosoftButton } from './MicrosoftButton';
import { useEffect, useState } from 'react';
import { useAuth } from '../firebase/AuthContext';
import { useParams, useRouter } from 'next/navigation';
import { getLocalizedHref } from '../LocalizedLink';
import { signInWithUIUC } from '../firebase/AuthContext';

export function AuthForm(props: PaperProps) {
    const [checked, setChecked] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const {user, loading} = useAuth()
    const router = useRouter()
    const params = useParams();


    const msLogin = () => {
        if (!checked) {
            setError("Please check agreements to login")
            return
        }

        signInWithUIUC().then((success) => {
            if (success) {
                router.push(getLocalizedHref(params, "/home"))
            }
        })
        
    }

    useEffect(()=>{
        if (user) {
            router.replace(getLocalizedHref(params, "/home"))
        }
    }, [])
    
  return (
    <Paper radius="md" p="lg" withBorder {...props} maw={400}>
      <Text size="lg" fw={500}>
        Welcome to RideList, login with
      </Text>

      <Group grow mb="md" mt="md">
        <MicrosoftButton radius="xl" onClick={msLogin}>Microsoft</MicrosoftButton>
      </Group>

      <Text size="xs" mb="md">
        Only UIUC account (@illinois.edu) are currently allowed for student verification.
      </Text>

      <Input.Wrapper label="Agreements" withAsterisk error={error}>
        <Checkbox 
            label="I agree to privacy policy and terms of service" 
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