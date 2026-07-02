'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getSessionUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';

const VALID = ['fr', 'ro', 'es'];

/** Change la langue (cookie + préférence persistée sur le profil si connecté). */
export async function setLocale(locale: string) {
  if (!VALID.includes(locale)) return;
  cookies().set('NEXT_LOCALE', locale, {
    maxAge: 365 * 24 * 60 * 60,
    path: '/'
  });
  const user = await getSessionUser();
  if (user) {
    await prisma.user.update({
      where: { id: user.userId },
      data: { langue: locale.toUpperCase() as 'FR' | 'RO' | 'ES' }
    });
  }
  revalidatePath('/', 'layout');
}
