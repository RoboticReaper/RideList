// i18next.d.ts
import 'i18next';
// Import your default language translation file
import common from '@/app/i18n/locales/en/common.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: {
      common: typeof common;
    };
  }
}