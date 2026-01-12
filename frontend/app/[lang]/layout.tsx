import { useServerTranslation } from '@/app/i18n/server';
import { TranslationProvider } from '@/app/i18n/provider';
import { PushPermissionModal } from '@/components/PushPermissionModal';
import { Metadata } from 'next';
import type { Viewport } from 'next';

type Props = {
  params: Promise<{ lang: string }>;
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#ffffff',
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  const { t } = await useServerTranslation(lang, 'common');
  const baseUrl = process.env.NODE_ENV === 'development'
    ? 'http://localhost:3000'
    : 'https://www.ridelist.app';

  return {
    title: {
      template: '%s | ' + t('metadata.title'),
      default: t('metadata.title')
    },
    description: t('metadata.description'),
    icons: {
      icon: '/logo_small.svg'
    },
    openGraph: {
      title: t('metadata.title'),
      description: t('metadata.description'),
      url: `${baseUrl}/${lang}`,
      siteName: t('metadata.siteName'),
      images: [
        {
          url: '/og-image.jpg',
          width: 1200,
          height: 630,
        }
      ],
      locale: lang,
      type: 'website',
    },

    alternates: {
      canonical: `${baseUrl}/${lang}`,
      languages: {
        'en': `${baseUrl}/en`,
        'zh': `${baseUrl}/zh`,
      },
    },
  }
}

export default async function LangLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const { i18n } = await useServerTranslation(lang, 'common');

  return (
    <TranslationProvider
      locale={lang}
      namespaces={['common']}
      resources={i18n.services.resourceStore.data}
    >
      {children}
      <PushPermissionModal />
    </TranslationProvider>
  );
}
