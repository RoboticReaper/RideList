'use client';
import { AppShell, Drawer } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { DashboardHeaderMenu } from '@/components/DashboardHeaderMenu/DashboardHeaderMenu';
import { DashboardNavbar } from '@/components/DashboardNavbar/DashboardNavbar';
import { DashboardProvider, useDashboard } from './DashboardContext';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardProvider>
      <DashboardContent>{children}</DashboardContent>
    </DashboardProvider>
  );
}

function DashboardContent({ children }: { children: React.ReactNode }) {
  const { role, setRole } = useDashboard();
  const [drawerOpened, { toggle: toggleDrawer, close: closeDrawer }] = useDisclosure(false);

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 250, breakpoint: 'sm', collapsed: { desktop: false, mobile: true } }}
      padding="md"
    >
      <AppShell.Header>
        <DashboardHeaderMenu role={role} onRoleChange={setRole} drawerOpened={drawerOpened} toggleDrawer={toggleDrawer} closeDrawer={closeDrawer} />
      </AppShell.Header>

      <AppShell.Main>
        {children}
      </AppShell.Main>

      <AppShell.Navbar>
        <DashboardNavbar drawerOpened={drawerOpened} toggleDrawer={toggleDrawer} closeDrawer={closeDrawer} />
      </AppShell.Navbar>

      <Drawer
        opened={drawerOpened}
        onClose={closeDrawer}
        size={250}
        padding={0}
        hiddenFrom="sm"
        withCloseButton={false}
        zIndex={10000}
      >
        <DashboardNavbar drawerOpened={drawerOpened} toggleDrawer={toggleDrawer} closeDrawer={closeDrawer} />
      </Drawer>

    </AppShell>
  );
}