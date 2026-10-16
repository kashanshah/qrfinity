import { getSessionCookie } from 'better-auth/cookies'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Sends signed-out visitors to sign-in, remembering where they were going. This only checks
 * that a session cookie exists; pages still verify the session itself.
 */
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next()
  const url = new URL('/login', request.url)
  url.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search)
  return NextResponse.redirect(url)
}

export const config = { matcher: ['/dashboard/:path*', '/dashboard'] }
