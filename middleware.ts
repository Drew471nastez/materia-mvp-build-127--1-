import { NextRequest, NextResponse } from 'next/server';

const MAIN_DOMAIN = 'storelib.com';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get('host') || '';

  // Strip port number if present (e.g., localhost:3000)
  const hostname = host.split(':')[0];

  // Skip rewrites for static files, API routes, etc.
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/api/') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  // Pass through for localhost / 127.0.0.1
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return NextResponse.next();
  }

  // Pass through for main domain
  if (hostname === MAIN_DOMAIN || hostname === `www.${MAIN_DOMAIN}`) {
    return NextResponse.next();
  }

  // Detect subdomain: host must end with .storelib.com and have more than 2 parts
  const hostParts = hostname.split('.');
  const isSubdomain =
    hostname.endsWith(`.${MAIN_DOMAIN}`) && hostParts.length > 2;

  if (!isSubdomain) {
    return NextResponse.next();
  }

  // Extract the username (leftmost subdomain segment)
  const username = hostParts[0];

  // Rewrite rules
  const url = request.nextUrl.clone();

  if (pathname === '/' || pathname === '') {
    // username.storelib.com/ → /u/username
    url.pathname = `/u/${username}`;
  } else if (pathname === '/links') {
    // username.storelib.com/links → /l/username
    url.pathname = `/l/${username}`;
  } else if (pathname.startsWith('/p/')) {
    // username.storelib.com/p/slug → /p/slug (pass through)
    url.pathname = pathname;
  } else {
    // username.storelib.com/anything-else → /u/username/anything-else
    url.pathname = `/u/${username}${pathname}`;
  }

  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
