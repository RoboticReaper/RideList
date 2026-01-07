'use client';

import Link, { LinkProps } from 'next/link';
import { useParams } from 'next/navigation';
import { ReactNode, forwardRef } from 'react';

interface LocalizedLinkProps extends LinkProps {
  children: ReactNode;
  href: string;
  className?: string;
  // Allow any other prop (aria-*, styles, etc)
  [key: string]: any;
}

export const getLocalizedHref = (params: any, href: string) => {
  // const lang = (params?.lang as string) || 'en';

  // let finalHref = href;

  // if (!href.startsWith('http') && !href.startsWith(`/${lang}`)) {
  //     finalHref = `/${lang}${href.startsWith('/') ? '' : '/'}${href}`;
  //   }

  return href
}


export const LocalizedLink = forwardRef<HTMLAnchorElement, LocalizedLinkProps>(
  ({ children, href, ...props }, ref) => {
    const params = useParams()

    let finalHref = getLocalizedHref(params, href)

    return (
      <Link
        href={finalHref}
        ref={ref}
        {...props}

        suppressHydrationWarning
      >
        {children}
      </Link>
    );
  }
);

LocalizedLink.displayName = 'LocalizedLink';