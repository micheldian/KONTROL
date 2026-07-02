import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

// Protège /admin (ADMIN/MANAGER), /app (OUVRIER/CHEF_EQUIPE) et /client (CLIENT).
// L'isolation multi-tenant est appliquée dans chaque requête serveur (organisationId de session).
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (pathname.startsWith('/admin')) {
    if (pathname.startsWith('/admin/login')) {
      if (token && (token.role === 'ADMIN' || token.role === 'MANAGER')) {
        return NextResponse.redirect(new URL('/admin', req.url));
      }
      return NextResponse.next();
    }
    if (!token || (token.role !== 'ADMIN' && token.role !== 'MANAGER')) {
      return NextResponse.redirect(new URL('/admin/login', req.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith('/client')) {
    if (pathname.startsWith('/client/login')) {
      if (token && token.role === 'CLIENT') {
        return NextResponse.redirect(new URL('/client', req.url));
      }
      return NextResponse.next();
    }
    if (!token || token.role !== 'CLIENT') {
      return NextResponse.redirect(new URL('/client/login', req.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith('/app')) {
    if (!token || (token.role !== 'OUVRIER' && token.role !== 'CHEF_EQUIPE')) {
      return NextResponse.redirect(new URL('/', req.url));
    }
    return NextResponse.next();
  }

  if (pathname === '/') {
    if (token && (token.role === 'OUVRIER' || token.role === 'CHEF_EQUIPE')) {
      return NextResponse.redirect(new URL('/app', req.url));
    }
    if (token && (token.role === 'ADMIN' || token.role === 'MANAGER')) {
      return NextResponse.redirect(new URL('/admin', req.url));
    }
    if (token && token.role === 'CLIENT') {
      return NextResponse.redirect(new URL('/client', req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/admin/:path*', '/app/:path*', '/client/:path*']
};
