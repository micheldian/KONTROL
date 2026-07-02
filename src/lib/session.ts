import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from './auth';

export type SessionUser = {
  userId: string;
  organisationId: string;
  role: 'ADMIN' | 'RH' | 'CHEF_EQUIPE' | 'OUVRIER';
  langue: 'FR' | 'RO' | 'ES';
  estChefEquipe: boolean;
  name: string;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);
  if (!session) return null;
  const s = session as any;
  if (!s.userId || !s.organisationId) return null;
  return {
    userId: s.userId,
    organisationId: s.organisationId,
    role: s.role,
    langue: s.langue ?? 'FR',
    estChefEquipe: !!s.estChefEquipe,
    name: session.user?.name ?? ''
  };
}

/** Back-office : ADMIN et RH uniquement. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user || (user.role !== 'ADMIN' && user.role !== 'RH')) {
    redirect('/admin/login');
  }
  return user;
}

/** ADMIN strict (paramètres, facturation, note vivier, réouverture clôture…). */
export async function requireAdminStrict(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user || user.role !== 'ADMIN') redirect('/admin/login');
  return user;
}

/** Portail ouvrier : OUVRIER et CHEF_EQUIPE. */
export async function requireWorker(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user || (user.role !== 'OUVRIER' && user.role !== 'CHEF_EQUIPE')) {
    redirect('/');
  }
  return user;
}
