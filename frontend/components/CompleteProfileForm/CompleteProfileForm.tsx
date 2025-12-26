'use client';
import { Button, Paper, Text, TextInput, Title, Stack } from '@mantine/core';
import { useState } from 'react';
import { useRouter, useSearchParams, useParams } from 'next/navigation';
import { getLocalizedHref } from '../LocalizedLink';
import { useAuth } from '../firebase/AuthContext';

export function CompleteProfileForm() {
    const [loading, setLoading] = useState(false);
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [error, setError] = useState('');
    const router = useRouter();
    const searchParams = useSearchParams();
    const params = useParams();
    const { user } = useAuth();
    const returnUrl = searchParams.get('returnUrl');

    const handleSubmit = async () => {
        if (!name.trim()) {
            setError('Name is required');
            return;
        }

        setLoading(true);

        try {
            if (user) {
                const token = await user.getIdToken();
                const res = await fetch('/api/user/create-profile', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ name, phone })
                });

                if (res.ok) {
                    const targetUrl = returnUrl ? getLocalizedHref(params, returnUrl) : getLocalizedHref(params, "/dashboard");
                    // Force full reload to ensuring AuthContext re-checks registration status
                    window.location.href = targetUrl;
                } else {
                    console.error("Failed to save profile");
                    alert("Failed to save profile");
                }
            }
        } catch (error) {
            console.error("Error saving profile:", error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Paper radius="md" p="xl" withBorder>
            <Title order={2} ta="center" mt="md" mb={50}>
                Complete your Profile
            </Title>

            <Stack>
                <TextInput
                    label="Full Name"
                    placeholder="Your name"
                    required
                    value={name}
                    onChange={(e) => {
                        setName(e.target.value);
                        setError('');
                    }}
                    error={error}
                />
                <TextInput
                    label="Phone Number"
                    placeholder="Optional"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                />

                <Button fullWidth mt="xl" onClick={handleSubmit} loading={loading}>
                    Save Profile
                </Button>
            </Stack>
        </Paper>
    );
}
