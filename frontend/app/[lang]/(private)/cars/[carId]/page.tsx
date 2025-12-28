'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/components/firebase/AuthContext';
import { Container, Loader, Alert } from '@mantine/core';
import CarForm from '@/components/CarForm/CarForm';

export default function CarEditorPage() {
    const params = useParams();
    const router = useRouter();
    const carId = params.carId as string;
    const { user } = useAuth();
    const [loading, setLoading] = useState(carId !== 'new');
    const [initialData, setInitialData] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!user || carId === 'new') return;

        const fetchData = async () => {
            try {
                const token = await user.getIdToken();
                const res = await fetch(`/api/user/cars/${carId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!res.ok) throw new Error('Failed to fetch car details');
                const data = await res.json();
                setInitialData(data.car);
            } catch (err: any) {
                console.error(err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [user, carId]);

    if (loading) return <Container py="xl"><Loader /></Container>;
    if (error) return <Container py="xl"><Alert color="red">{error}</Alert></Container>;

    return (
        <CarForm
            initialData={initialData}
            isEditing={carId !== 'new'}
            carId={carId}
        />
    );
}
