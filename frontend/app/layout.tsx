import '@mantine/core/styles.css';

import { ColorSchemeScript, MantineProvider, mantineHtmlProps } from '@mantine/core';
import { Suspense } from 'react';
import { AuthProvider } from '@/components/firebase/AuthContext';
import { LanguageSyncer } from '@/components/LanguageSyncer';
import { NotificationProvider } from '@/components/Notifications/NotificationContext';
import { TitleNotificationUpdater } from '@/components/Notifications/TitleNotificationUpdater';
import { Notifications } from '@mantine/notifications';
import { SpeedInsights } from "@vercel/speed-insights/next"
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
        <link rel="apple-touch-icon" sizes="180x180" href="/icon-ios-180.png" />
        <link rel="apple-touch-icon" sizes="167x167" href="/icon-ios-167.png" />
        <link rel="apple-touch-icon" sizes="120x120" href="/icon-ios-120.png" />
        <link rel="icon" href="/icon-android-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="RideList" />
      </head>
      <body>
        <SpeedInsights />
        <MantineProvider>
          <Suspense fallback={null}>
            <AuthProvider>
              <LanguageSyncer />
              <NotificationProvider>
                <TitleNotificationUpdater />
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
