import { NextResponse, type NextRequest } from 'next/server'

/** Block Payload's special unauthenticated first-user registration route.
 * This check is server-side and independent of Origin, cookies, or UI state.
 */
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname.replace(/\/+$/u, '')
  if (request.method === 'POST' && path === '/api/users/first-register') {
    return NextResponse.json({ errors: [{ message: 'First-user registration is disabled. Use the protected local bootstrap procedure.' }] }, { status: 403 })
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/api/users/first-register'],
}
