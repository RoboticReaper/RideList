import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { languages, fallbackLng, cookieName } from './app/i18n/settings';
import acceptLanguage from 'accept-language';
import { ipAddress } from '@vercel/functions'

acceptLanguage.languages(languages);

// Simple in-memory rate limit (Edge-safe)
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 60;           // 60 requests / minute

const rateLimitMap = new Map<
  string,
  { count: number; windowStart: number }
>();

function isRateLimited(ip: string) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return false;
  }

  if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    // Reset window
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return false;
  }

  entry.count += 1;

  return entry.count > RATE_LIMIT_MAX;
}


export default function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (
    pathname.includes('/search')
  ) {
    const ip =
      ipAddress(request) ||
      request.headers.get('x-forwarded-for')?.split(',')[0] ||
      'unknown';

    if (isRateLimited(ip)) {
      return new NextResponse(
        JSON.stringify({ error: 'Too many requests' }),
        {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  }

  // 1. i18n
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