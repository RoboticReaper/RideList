import { useEffect } from 'react';
import {
    Icon2fa,
    IconBellRinging,
    IconDatabaseImport,
    IconFingerprint,
    IconKey,
    IconLogout,
    IconReceipt2,
    IconHome,
    IconHistory,
    IconCar,
    IconLayoutDashboard,
    IconSwitchHorizontal,
    IconSettings
} from '@tabler/icons-react';
import { Code, Group } from '@mantine/core';
import classes from './DashboardNavbar.module.css';
import { useDashboard } from '@/app/[lang]/(private)/DashboardContext';
import { LocalizedLink } from '../LocalizedLink';
import { usePathname } from 'next/navigation';

export function DashboardNavbar({ drawerOpened, toggleDrawer, closeDrawer }: { drawerOpened: boolean, toggleDrawer: () => void, closeDrawer: () => void }) {
    const { role, activeLink, setActiveLink } = useDashboard();
    const pathname = usePathname();

    const data = [
        { link: '/dashboard', label: 'Dashboard', icon: IconLayoutDashboard },
        { link: '/history', label: 'History', icon: IconHistory },
        { link: '/roleSettings', label: 'Role-based Settings', icon: IconSettings },
    ];

    useEffect(() => {
        // Find matching link based on pathname
        // We need to handle localization prefixes if present, or just use endsWith
        // LocalizedLink adds the prefix, so the link data here should probably be the suffix?
        // But LocalizedLink href expects the suffix.
        // pathname will include /en/dashboard etc.
        // Let's iterate and see if pathname contains the link.
        // Assuming links are unique enough.

        const currentItem = data.find(item => pathname.endsWith(item.link));
        if (currentItem) {
            setActiveLink(currentItem.label);
        } else if (pathname.endsWith('/')) {
            // Handle root?
        }
    }, [pathname, role, setActiveLink]);

    const links = data.map((item) => (
        <LocalizedLink
            className={classes.link}
            data-active={item.label === activeLink || undefined}
            href={item.link}
            key={item.label}
            onClick={() => {
                setActiveLink(item.label);
                if (drawerOpened) {
                    closeDrawer();
                }
            }}
        >
            <item.icon className={classes.linkIcon} stroke={1.5} />
            <span>{item.label}</span>
        </LocalizedLink>
    ));

    return (
        <nav className={classes.navbar}>
            <div className={classes.navbarMain}>
                {links}
            </div>

        </nav>
    );
}