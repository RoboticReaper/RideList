'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface RoleContextType {
    role: string;
    setRole: (role: string) => void;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

export function RoleProvider({ children }: { children: ReactNode }) {
    const [role, setRole] = useState('rider');
    const [mounted, setMounted] = useState(false);

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

    // Prevent hydration mismatch by waiting for mount or just rendering children with default
    // Ideally for local storage we want to wait, but 'rider' default is fine for initial render
    // to prevent flicker we might want to return null if not mounted, but that blocks SEO/rendering.
    // Since this is a dashboard, blocking until client side verify could be okay, 
    // but to keep it simple and fast we render immediately.
    // Given the original code rendered immediately with default 'rider' then updated, we keep that behavior.

    return (
        <RoleContext.Provider value={{ role, setRole }}>
            {children}
        </RoleContext.Provider>
    );
}

export function useRole() {
    const context = useContext(RoleContext);
    if (context === undefined) {
        throw new Error('useRole must be used within a RoleProvider');
    }
    return context;
}
