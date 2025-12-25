'use client';

import { AppShell } from '@mantine/core';
import { HeaderMenu } from '@/components/HeaderMenu/HeaderMenu';
import { Footer } from "@/components/Footer/Footer";

export default function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AppShell header={{ height: 60 }} padding="0">
      <AppShell.Header>
        <HeaderMenu />
      </AppShell.Header>
      <AppShell.Main>
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 60px)' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {children}
          </div>
          <Footer />
        </div>
      </AppShell.Main>
    </AppShell>
  );
}