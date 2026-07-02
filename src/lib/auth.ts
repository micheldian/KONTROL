import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';

const PIN_MAX_ECHECS = 5;
const PIN_BLOCAGE_MINUTES = 15;

/** Normalise un téléphone : chiffres et + uniquement, 06… → +336… */
export function normalisePhone(raw: string): string {
  let p = raw.replace(/[^\d+]/g, '');
  if (p.startsWith('00')) p = '+' + p.slice(2);
  if (p.startsWith('0') && p.length === 10) p = '+33' + p.slice(1);
  return p;
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60 // 30 jours (spec 3.1)
  },
  pages: {
    signIn: '/'
  },
  providers: [
    // ADMIN / MANAGER / CLIENT : email + mot de passe
    CredentialsProvider({
      id: 'admin-credentials',
      name: 'Admin',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Mot de passe', type: 'password' }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) return null;
        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase().trim() }
        });
        if (!user || !user.motDePasseHash || !user.actif) return null;
        if (user.role !== 'ADMIN' && user.role !== 'MANAGER' && user.role !== 'CLIENT') return null;

        // Même rate-limiting que le PIN : 5 échecs → blocage 15 min
        if (user.pinBloqueJusqua && user.pinBloqueJusqua > new Date()) {
          throw new Error('COMPTE_BLOQUE');
        }
        const ok = await bcrypt.compare(credentials.password, user.motDePasseHash);
        if (!ok) {
          const echecs = user.pinEchecs + 1;
          await prisma.user.update({
            where: { id: user.id },
            data: {
              pinEchecs: echecs >= PIN_MAX_ECHECS ? 0 : echecs,
              pinBloqueJusqua:
                echecs >= PIN_MAX_ECHECS
                  ? new Date(Date.now() + PIN_BLOCAGE_MINUTES * 60 * 1000)
                  : null
            }
          });
          return null;
        }
        if (user.pinEchecs > 0 || user.pinBloqueJusqua) {
          await prisma.user.update({
            where: { id: user.id },
            data: { pinEchecs: 0, pinBloqueJusqua: null }
          });
        }
        return {
          id: user.id,
          name: `${user.prenom} ${user.nom}`,
          email: user.email,
          role: user.role,
          organisationId: user.organisationId,
          langue: user.langue,
          estChefEquipe: user.estChefEquipe,
          clientId: user.clientId
        } as any;
      }
    }),
    // OUVRIER / CHEF_EQUIPE : téléphone + PIN 4 chiffres, rate-limité
    CredentialsProvider({
      id: 'pin',
      name: 'Ouvrier',
      credentials: {
        telephone: { label: 'Téléphone', type: 'tel' },
        pin: { label: 'PIN', type: 'password' }
      },
      async authorize(credentials) {
        if (!credentials?.telephone || !credentials.pin) return null;
        const telephone = normalisePhone(credentials.telephone);
        const user = await prisma.user.findUnique({ where: { telephone } });
        if (!user || !user.pinHash || !user.actif) return null;
        if (user.statutProfil !== 'ACTIF') return null;

        // Blocage 15 min après 5 échecs
        if (user.pinBloqueJusqua && user.pinBloqueJusqua > new Date()) {
          throw new Error('PIN_BLOQUE');
        }

        const ok = await bcrypt.compare(credentials.pin, user.pinHash);
        if (!ok) {
          const echecs = user.pinEchecs + 1;
          await prisma.user.update({
            where: { id: user.id },
            data: {
              pinEchecs: echecs >= PIN_MAX_ECHECS ? 0 : echecs,
              pinBloqueJusqua:
                echecs >= PIN_MAX_ECHECS
                  ? new Date(Date.now() + PIN_BLOCAGE_MINUTES * 60 * 1000)
                  : null
            }
          });
          if (echecs >= PIN_MAX_ECHECS) throw new Error('PIN_BLOQUE');
          return null;
        }

        if (user.pinEchecs > 0 || user.pinBloqueJusqua) {
          await prisma.user.update({
            where: { id: user.id },
            data: { pinEchecs: 0, pinBloqueJusqua: null }
          });
        }

        return {
          id: user.id,
          name: `${user.prenom} ${user.nom}`,
          role: user.role,
          organisationId: user.organisationId,
          langue: user.langue,
          estChefEquipe: user.estChefEquipe
        } as any;
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as any;
        token.userId = u.id;
        token.role = u.role;
        token.organisationId = u.organisationId;
        token.langue = u.langue;
        token.estChefEquipe = u.estChefEquipe;
        token.clientId = u.clientId ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      (session as any).userId = token.userId;
      (session as any).role = token.role;
      (session as any).organisationId = token.organisationId;
      (session as any).langue = token.langue;
      (session as any).estChefEquipe = token.estChefEquipe;
      (session as any).clientId = token.clientId ?? null;
      return session;
    }
  }
};
