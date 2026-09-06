'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import { audit } from '@/lib/audit';
import { assurerMigrations } from '@/lib/migrations-auto';

const TAILLE_MAX = 600 * 1024; // le client réduit à ≤ 640 px JPEG (~50-150 Ko)

const photoSchema = z.object({
  userId: z.string().min(1),
  // data URL produite par le canvas côté client
  dataUrl: z.string().regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/)
});

type Resultat = { ok: boolean; erreur?: string; version?: number };

/** Enregistre (ou remplace) la photo d'un ouvrier — ADMIN/MANAGER, tracé. */
export async function enregistrerPhoto(input: unknown): Promise<Resultat> {
  try {
    const user = await requireAdmin();
    const parsed = photoSchema.parse(input);
    await assurerMigrations();

    const profil = await prisma.user.findFirst({
      where: {
        id: parsed.userId,
        organisationId: user.organisationId,
        role: { in: ['OUVRIER', 'CHEF_EQUIPE'] }
      },
      select: { id: true }
    });
    if (!profil) return { ok: false, erreur: 'Profil introuvable' };

    const [entete, base64] = parsed.dataUrl.split(',', 2);
    const mimeType = entete.slice('data:'.length, entete.indexOf(';'));
    const contenu = Buffer.from(base64, 'base64');
    if (contenu.length === 0) return { ok: false, erreur: 'Image vide' };
    if (contenu.length > TAILLE_MAX) {
      return { ok: false, erreur: 'Image trop lourde (600 Ko max après réduction)' };
    }

    const photo = await prisma.photoOuvrier.upsert({
      where: { userId: profil.id },
      update: { mimeType, taille: contenu.length, contenu, majAt: new Date(), majParId: user.userId },
      create: {
        organisationId: user.organisationId,
        userId: profil.id,
        mimeType,
        taille: contenu.length,
        contenu,
        majParId: user.userId
      }
    });
    await audit({
      organisationId: user.organisationId,
      userId: user.userId,
      action: 'ouvrier.photo',
      entite: 'User',
      entiteId: profil.id,
      apres: { taille: contenu.length, mimeType }
    });
    revalidatePath(`/admin/ouvriers/${profil.id}`);
    revalidatePath(`/admin/vivier/${profil.id}`);
    revalidatePath('/admin/ouvriers');
    revalidatePath('/admin/vivier');
    return { ok: true, version: photo.majAt.getTime() };
  } catch (e) {
    return { ok: false, erreur: e instanceof Error ? e.message : 'Erreur inattendue' };
  }
}

/** Supprime la photo d'un ouvrier — tracé. */
export async function supprimerPhoto(input: unknown): Promise<Resultat> {
  try {
    const user = await requireAdmin();
    const { userId } = z.object({ userId: z.string().min(1) }).parse(input);
    await assurerMigrations();

    const photo = await prisma.photoOuvrier.findFirst({
      where: { userId, organisationId: user.organisationId },
      select: { id: true }
    });
    if (!photo) return { ok: true };
    await prisma.photoOuvrier.delete({ where: { id: photo.id } });
    await audit({
      organisationId: user.organisationId,
      userId: user.userId,
      action: 'ouvrier.photo.supprimer',
      entite: 'User',
      entiteId: userId
    });
    revalidatePath(`/admin/ouvriers/${userId}`);
    revalidatePath(`/admin/vivier/${userId}`);
    revalidatePath('/admin/ouvriers');
    revalidatePath('/admin/vivier');
    return { ok: true };
  } catch (e) {
    return { ok: false, erreur: e instanceof Error ? e.message : 'Erreur inattendue' };
  }
}
