import { dossierParToken } from '@/lib/embauche';
import {
  rendreTemplate,
  variablesDossier,
  MODELE_CONTRAT_DEFAUT,
  MODELE_MUTUELLE_ADHESION_DEFAUT,
  MODELE_MUTUELLE_DISPENSE_DEFAUT,
  MOTIFS_DISPENSE
} from '@/lib/contrats';
import { prisma } from '@/lib/prisma';
import { formatDate, ymd } from '@/lib/dates';
import ParcoursOnboarding from './parcours';

export const dynamic = 'force-dynamic';

// Parcours d'embauche public (mode distant) — lien token sans compte, 7 jours.
// Le même composant sert au mode kiosque (/admin/embauches/[id]/kiosque).
export default async function EmbauchePage({ params }: { params: { token: string } }) {
  const dossier = await dossierParToken(params.token);

  if (!dossier) {
    return (
      <main className="mx-auto flex min-h-screen max-w-[440px] flex-col justify-center px-6 text-center">
        <div className="text-[42px]">⏳</div>
        <h1 className="mt-2 text-[19px] font-bold">Lien invalide ou expiré</h1>
        <p className="mt-2 text-[14px] text-muted">
          Link invalid sau expirat · Enlace inválido o caducado
        </p>
        <p className="mt-4 text-[13.5px] text-muted">
          Demandez un nouveau lien à votre employeur. / Cereți un link nou angajatorului. /
          Pida un nuevo enlace a su empleador.
        </p>
      </main>
    );
  }

  const variables = variablesDossier({
    dossier,
    ouvrier: dossier.user,
    organisation: dossier.organisation,
    logement: dossier.logement
  });
  const [modeleAdhesion, modeleDispense] = await Promise.all([
    prisma.modeleContrat.findFirst({
      where: { organisationId: dossier.organisationId, categorie: 'MUTUELLE_ADHESION', actif: true },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.modeleContrat.findFirst({
      where: { organisationId: dossier.organisationId, categorie: 'MUTUELLE_DISPENSE', actif: true },
      orderBy: { createdAt: 'desc' }
    })
  ]);

  return (
    <ParcoursOnboarding
      token={params.token}
      langue={dossier.user.langue}
      prenom={dossier.user.prenom}
      organisation={dossier.organisation.nom}
      dateDebut={formatDate(ymd(dossier.dateDebut))}
      checklist={Object.fromEntries(dossier.checklist.map((c) => [c.type, c.statut]))}
      identite={{
        nom: dossier.user.nom,
        prenoms: dossier.user.prenom,
        dateNaissance: dossier.user.dateNaissance ? ymd(dossier.user.dateNaissance) : '',
        lieuNaissance: dossier.user.lieuNaissance ?? '',
        nationalite: dossier.user.nationalite ?? '',
        adresse: dossier.user.adresse ?? ''
      }}
      ibanExistant={dossier.user.iban ?? ''}
      titreContrat={dossier.modeleContrat?.nom ?? 'Contrat de travail saisonnier'}
      texteContrat={rendreTemplate(
        dossier.modeleContrat?.contenuTemplate ?? MODELE_CONTRAT_DEFAUT,
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
    />
  );
}
