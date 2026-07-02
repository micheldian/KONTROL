import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from './auth';

export type SessionUser = {
  userId: string;
  organisationId: string;
  role: 'ADMIN' | 'MANAGER' | 'CLIENT' | 'CHEF_EQUIPE' | 'OUVRIER';
  clientId: string | null;
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
    clientId: s.clientId ?? null,
    name: session.user?.name ?? ''
  };
}

/** Back-office : ADMIN et MANAGER uniquement. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user || (user.role !== 'ADMIN' && user.role !== 'MANAGER')) {
    redirect('/admin/login');
  }
  return user;
}

/** Portail client : rôle CLIENT rattaché à une entité Client (lecture seule). */
export async function requireClient(): Promise<SessionUser & { clientId: string }> {
  const user = await getSessionUser();
  if (!user || user.role !== 'CLIENT' || !user.clientId) {
    redirect('/client/login');
  }
  return user as SessionUser & { clientId: string };
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
