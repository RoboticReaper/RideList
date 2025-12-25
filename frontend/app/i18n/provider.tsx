'use client';

import { I18nextProvider } from 'react-i18next';
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getOptions } from './settings';
import { useMemo } from 'react';

export function TranslationProvider({ 
  children, 
  locale, 
  namespaces, 
  resources 
}: { 
  children: React.ReactNode; 
  locale: string; 
  namespaces: string[]; 
  resources: any; 
}) {
    // useMemo to prevent reinitializing i18n on every render
  const i18n = useMemo(() => {
    const instance = createInstance();

    instance
      .use(initReactI18next)
      .init({
        ...getOptions(locale, namespaces),
        lng: locale,
        resources, 
      });

    return instance;
  }, [locale, namespaces, resources]);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}