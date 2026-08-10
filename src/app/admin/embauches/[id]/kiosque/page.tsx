import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { dossierParToken, genererTokenOnboarding, delaiTokenJours } from '@/lib/embauche';
import {
  rendreTemplate,
  variablesDossier,
  MODELE_CONTRAT_DEFAUT,
  MODELE_MUTUELLE_ADHESION_DEFAUT,
  MODELE_MUTUELLE_DISPENSE_DEFAUT,
  MOTIFS_DISPENSE
} from '@/lib/contrats';
import { formatDate, ymd } from '@/lib/dates';
import ParcoursOnboarding from '@/app/embauche/[token]/parcours';

export const dynamic = 'force-dynamic';

// Mode kiosque (spec B.2) : le manager déroule le parcours sur l'iPad/iPhone
// Pickajob AVEC l'ouvrier présent — l'ouvrier signe lui-même au doigt.
// Chaque étape trace : horodatage, appareil, compte admin accompagnant
// (la session back-office est détectée côté serveur dans les actions).
export default async function KiosquePage({ params }: { params: { id: string } }) {
  const user = await requireAdmin();
  let dossier = await prisma.dossierEmbauche.findFirst({
    where: { id: params.id, organisationId: user.organisationId }
  });
  if (!dossier || dossier.statut === 'ANNULE') notFound();

  // Le kiosque passe par le même token que le mode distant (parcours unique)
  if (!dossier.tokenOnboarding || (dossier.tokenExpireAt && dossier.tokenExpireAt < new Date())) {
    const org = await prisma.organisation.findUnique({ where: { id: user.organisationId } });
    const expire = new Date();
    expire.setDate(expire.getDate() + delaiTokenJours(org?.parametres));
    dossier = await prisma.dossierEmbauche.update({
      where: { id: dossier.id },
      data: { tokenOnboarding: genererTokenOnboarding(), tokenExpireAt: expire }
    });
  }

  const complet = await dossierParToken(dossier.tokenOnboarding!);
  if (!complet) notFound();

  const variables = variablesDossier({
    dossier: complet,
    ouvrier: complet.user,
    organisation: complet.organisation,
    logement: complet.logement
  });
  const [modeleAdhesion, modeleDispense] = await Promise.all([
    prisma.modeleContrat.findFirst({
      where: { organisationId: user.organisationId, categorie: 'MUTUELLE_ADHESION', actif: true },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.modeleContrat.findFirst({
      where: { organisationId: user.organisationId, categorie: 'MUTUELLE_DISPENSE', actif: true },
      orderBy: { createdAt: 'desc' }
    })
  ]);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between rounded-card border-[1.5px] border-[#F2DCA6] bg-[#FFF9E8] px-4 py-2.5 text-[13px]">
        <span>
          📱 <b>Mode kiosque</b> — tendez l’appareil à l’ouvrier pour chaque étape ; c’est{' '}
          <b>lui</b> qui confirme et signe. Accompagnant tracé : {user.name}
        </span>
        <Link href={`/admin/embauches/${complet.id}`} className="btn-sm btn-outline">
          ← Dossier
        </Link>
      </div>
      <ParcoursOnboarding
        token={complet.tokenOnboarding!}
        langue={complet.user.langue}
        prenom={complet.user.prenom}
        organisation={complet.organisation.nom}
        dateDebut={formatDate(ymd(complet.dateDebut))}
        checklist={Object.fromEntries(complet.checklist.map((c) => [c.type, c.statut]))}
        identite={{
          nom: complet.user.nom,
          prenoms: complet.user.prenom,
          dateNaissance: complet.user.dateNaissance ? ymd(complet.user.dateNaissance) : '',
          lieuNaissance: complet.user.lieuNaissance ?? '',
          nationalite: complet.user.nationalite ?? '',
          adresse: complet.user.adresse ?? ''
        }}
        ibanExistant={complet.user.iban ?? ''}
        titreContrat={complet.modeleContrat?.nom ?? 'Contrat de travail saisonnier'}
        texteContrat={rendreTemplate(
          complet.modeleContrat?.contenuTemplate ?? MODELE_CONTRAT_DEFAUT,
          variables
        )}
        texteMutuelleAdhesion={rendreTemplate(
          modeleAdhesion?.contenuTemplate ?? MODELE_MUTUELLE_ADHESION_DEFAUT,
          variables
        )}
        texteMutuelleDispense={rendreTemplate(
          modeleDispense?.contenuTemplate ?? MODELE_MUTUELLE_DISPENSE_DEFAUT,
          { ...variables, motifDispense: '____________________' }
        )}
        motifsDispense={MOTIFS_DISPENSE}
        kiosque
      />
    </div>
  );
}
