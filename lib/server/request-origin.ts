import type { NextRequest } from 'next/server';

export function getRequestOrigin(req: NextRequest): string {
  const forwardedHost = req.headers.get('x-forwarded-host');
  if (forwardedHost) {
    const forwardedProto = req.headers.get('x-forwarded-proto') || 'https';
    return `${forwardedProto}://${forwardedHost}`;
  }
  return req.nextUrl.origin;
}
