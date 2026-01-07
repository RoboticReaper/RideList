'use client';
import { TripTemplateForm } from '@/components/TripTemplateForm/TripTemplateForm';
import { useAuth } from '@/components/firebase/AuthContext';
import { Container, Loader, Text } from '@mantine/core';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

import { useTranslation } from 'react-i18next';

export default function TripTemplateEditorPage() {
    const { t } = useTranslation('common');
    const params = useParams();
    const templateId = params.templateId as string;
    const { user } = useAuth();
    const [initialData, setInitialData] = useState<any>(null);
    const [loading, setLoading] = useState(templateId !== 'new');
    const [error, setError] = useState('');

    useEffect(() => {
        if (templateId !== 'new' && user) {
            user.getIdToken().then(token => {
                fetch(`/api/user/trip-templates/${templateId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                })
                    .then(res => {
                        if (!res.ok) throw new Error(t('templates.trips.errors.loadFailed'));
                        return res.json();
                    })
                    .then(data => {
                        if (data.template) {
                            setInitialData(data.template);
                        } else {
                            setError(t('templates.trips.errors.notFound'));
                        }
                    })
                    .catch(err => {
                        console.error(err);
                        setError(err.message);
                    })
                    .finally(() => setLoading(false));
            });
        } else if (templateId === 'new') {
            setLoading(false);
        }
    }, [templateId, user, t]);

    if (loading) return <Container py="xl"><Loader /></Container>;
    if (error) return <Container py="xl"><Text c="red">{error}</Text></Container>;

    return (
        <Container py="xl">
            <TripTemplateForm templateId={templateId} initialData={initialData} />
        </Container>
    );
}
