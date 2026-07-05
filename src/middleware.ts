import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

// Protège /admin (ADMIN/MANAGER), /app (OUVRIER/CHEF_EQUIPE) et /client (CLIENT).
// L'isolation multi-tenant est appliquée dans chaque requête serveur (organisationId de session).
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Lien de recrutement pré-langué : /rejoindre?lang=ro ouvre directement en
  // roumain (cookie posé puis URL nettoyée) — idem lang=es / lang=fr.
  if (pathname === '/rejoindre') {
    const lang = req.nextUrl.searchParams.get('lang');
    if (lang && ['fr', 'ro', 'es'].includes(lang)) {
      const url = req.nextUrl.clone();
      url.searchParams.delete('lang');
      const res = NextResponse.redirect(url);
      res.cookies.set('NEXT_LOCALE', lang, { maxAge: 365 * 24 * 60 * 60, path: '/' });
      return res;
    }
    return NextResponse.next();
  }

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
  matcher: ['/', '/admin/:path*', '/app/:path*', '/client/:path*', '/rejoindre']
};
