import '@mantine/core/styles.css';

import { ColorSchemeScript, MantineProvider, mantineHtmlProps } from '@mantine/core';
import { AuthProvider } from '@/components/firebase/AuthContext';
import { LanguageSyncer } from '@/components/LanguageSyncer';
import { NotificationProvider } from '@/components/Notifications/NotificationContext';
import { Notifications } from '@mantine/notifications';
import '@mantine/dates/styles.css';
import '@mantine/notifications/styles.css';

import { NotificationManager } from '@/components/NotificationManager';

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
          <AuthProvider>
            <LanguageSyncer />
            <NotificationProvider>
              <Notifications />
              <NotificationManager />
              {children}
            </NotificationProvider>
          </AuthProvider>
        </MantineProvider>
      </body>
    </html>
  );
}
