import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { languages, fallbackLng, cookieName } from './app/i18n/settings';
import acceptLanguage from 'accept-language';

acceptLanguage.languages(languages);

export default function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // 1. Redirect root to /rides if needed (optional, depends on app structure)
  // If you have a landing page at /, keep it.
  // If / redirects to /rides, handle it here or in page.tsx

  // 2. Check if pathname already has a locale
  const pathnameHasLocale = languages.some(
    (locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
  );

  if (pathnameHasLocale) {
    // If the path has a locale, we should set the cookie to that locale
    // so future requests without locale respect this choice.
    const locale = languages.find(
      (l) => pathname.startsWith(`/${l}/`) || pathname === `/${l}`
    );
    const response = NextResponse.next();
    if (locale) {
      response.cookies.set(cookieName, locale);
    }
    return response;
  }

  // 3. Pathname check for missing locale (implied true at this point for matched paths)

  // 4. Determine preferred locale
  let locale = fallbackLng;

  // Check cookie first
  if (request.cookies.has(cookieName)) {
    const cookieLocale = request.cookies.get(cookieName)?.value;
    if (cookieLocale && languages.includes(cookieLocale)) {
      locale = cookieLocale;
    }
  } else {
    // Check Accept-Language header if no cookie
    locale = acceptLanguage.get(request.headers.get('Accept-Language')) || fallbackLng;
  }

  // 5. Rewrite logic
  // Instead of redirecting to /en/rides, we rewrite /rides to /en/rides
  // This keeps the URL clean: /rides
  return NextResponse.rewrite(
    new URL(`/${locale}${pathname}${request.nextUrl.search}`, request.url)
  );
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|.well-known|favicon.ico|.*\\..*).*)',

  ],
};