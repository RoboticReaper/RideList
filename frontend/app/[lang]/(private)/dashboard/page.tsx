'use client';

import { useDashboard } from '@/app/[lang]/(private)/DashboardContext';

export default function DashboardPage() {
    const { role } = useDashboard();
    return <div>Upcoming trips for {role}</div>;
}