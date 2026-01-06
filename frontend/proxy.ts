import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { languages, fallbackLng } from './app/i18n/settings';
import acceptLanguage from 'accept-language';

acceptLanguage.languages(languages);

export default function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Check if pathname is missing a locale
  const pathnameIsMissingLocale = languages.every(
    (locale) => !pathname.startsWith(`/${locale}/`) && pathname !== `/${locale}`
  );

  if (pathnameIsMissingLocale) {
    const locale = acceptLanguage.get(request.headers.get('Accept-Language')) || fallbackLng;
    request.nextUrl.searchParams.forEach((value, key) => {
      // Just to be sure we are not losing anything, but search string approach is cleaner
    });
    return NextResponse.redirect(
      new URL(`/${locale}${pathname}${request.nextUrl.search}`, request.url)
    );
  }
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|.well-known|favicon.ico|.*\\..*).*)',

  ],
};