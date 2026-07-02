import { prisma } from './prisma';

/** Journalise une action sensible (règle : audit log sur toutes les actions sensibles). */
export async function audit(params: {
  organisationId: string;
  userId: string;
  action: string;
  entite: string;
  entiteId: string;
  avant?: unknown;
  apres?: unknown;
}) {
  await prisma.auditLog.create({
    data: {
      organisationId: params.organisationId,
      userId: params.userId,
      action: params.action,
      entite: params.entite,
      entiteId: params.entiteId,
      avant: params.avant === undefined ? undefined : (params.avant as any),
      apres: params.apres === undefined ? undefined : (params.apres as any)
    }
  });
}
