'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { usePathname } from 'next/navigation';

interface DashboardContextType {
    role: string;
    setRole: (role: string) => void;
    activeLink: string;
    setActiveLink: (link: string) => void;
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

export function DashboardProvider({ children }: { children: ReactNode }) {
    const [role, setRole] = useState('rider');
    const [activeLink, setActiveLink] = useState('');
    const [mounted, setMounted] = useState(false);
    const pathname = usePathname();

    useEffect(() => {
        const storedRole = localStorage.getItem('lastRole');
        if (storedRole) {
            setRole(storedRole);
        }
        setMounted(true);
    }, []);

    useEffect(() => {
        if (mounted) {
            localStorage.setItem('lastRole', role);
        }
    }, [role, mounted]);

    // Update active link based on pathname
    useEffect(() => {
        // Simple logic: if pathname ends with the link or is the link
        // We might need more complex matching if nested routes are involved
        // For now, let's just expose the setter and let the Navbar handle specifics if needed, 
        // OR we can try to derive it here.
        // The user asked "make all children... know which item... is active".

        // This effect will run on pathname change.
        // We can just set activeLink to pathname? 
        // But dashboard links might be just the label? 
        // The navbar uses labels like "Billing", "Overview".
        // The task said "make the active navbar item highlighted based on the current route".
        // So activeLink should probably correspond to the LABEL or the HREF. 
        // Let's use HREF/key to be safer.

        // Let's defer exact logic to the consumers or just allow manual setting if they want to override.
        // But for "on first load", we probably want to set it based on pathname?
        // Actually, if we use LocalizedLink and exact matching in Navbar, we can just use pathname for highlighting.
        // But the user said "children... know... which item is active".
        // So let's store the *label* or *id* of the active item.

        // Use a default empty string, and let components update it? 
        // Or try to map pathname to a label? 
        // Since the Navbar defines the mapping data, maybe the Navbar should be responsible for updating this context 
        // when it detects a matching route.
    }, [pathname]);

    return (
        <DashboardContext.Provider value={{ role, setRole, activeLink, setActiveLink }}>
            {children}
        </DashboardContext.Provider>
    );
}

export function useDashboard() {
    const context = useContext(DashboardContext);
    if (context === undefined) {
        throw new Error('useDashboard must be used within a DashboardProvider');
    }
    return context;
}
