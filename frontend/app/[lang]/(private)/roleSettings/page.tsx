'use client';

import { useDashboard } from '@/app/[lang]/(private)/DashboardContext';

export default function RoleSettingsPage() {
    const { role } = useDashboard();
    return <div>{role} Settings</div>;
}   