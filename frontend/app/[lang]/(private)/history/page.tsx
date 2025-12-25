'use client';

import { useDashboard } from '@/app/[lang]/(private)/DashboardContext';

export default function HistoryPage() {
    const { role } = useDashboard();
    return <div>Trip history for {role}</div>;
}