import '@mantine/core/styles.css';

import { ColorSchemeScript, MantineProvider, mantineHtmlProps } from '@mantine/core';
import { Suspense } from 'react';
import { AuthProvider } from '@/components/firebase/AuthContext';
import { LanguageSyncer } from '@/components/LanguageSyncer';
import { NotificationProvider } from '@/components/Notifications/NotificationContext';
import { Notifications } from '@mantine/notifications';
import '@mantine/dates/styles.css';
import '@mantine/notifications/styles.css';



export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" {...mantineHtmlProps}>
      <head>
        <ColorSchemeScript />
      </head>
      <body>
        <MantineProvider>
          <Suspense fallback={null}>
            <AuthProvider>
              <LanguageSyncer />
              <NotificationProvider>
                <Notifications />
                <Suspense fallback={<div>Loading texts...</div>}>
                  {children}
                </Suspense>
              </NotificationProvider>
            </AuthProvider>
          </Suspense>
        </MantineProvider>
      </body>
    </html>
  );
}
