import 'server-only';
import type { DossierEmbauche, Organisation, User } from '@prisma/client';
import { dechiffreChamp } from '@/lib/documents';
import { formatDate, ymd } from '@/lib/dates';

// DPAE niveau 1 (phase 18) : préparation TESA/MSA — tous les champs requis,
// présentés champ par champ, copiables, pour un dépôt manuel sur le site MSA
// en ~1 minute. Architecture DpaeProvider isolée pour brancher plus tard une
// automatisation (EDI / robot) sans refonte.

export type ChampDpae = {
  cle: string;
  label: string;
  valeur: string;
  section: 'Employeur' | 'Salarié' | 'Contrat';
  manquant?: boolean;
};

export interface DpaeProvider {
  /** Prépare les champs au format attendu par le téléservice TESA/MSA. */
  preparer(params: {
    dossier: DossierEmbauche;
    ouvrier: User;
    organisation: Organisation;
  }): ChampDpae[];
}

/** Niveau 1 : préparation manuelle (copier-coller vers le site MSA). */
export class ManualDpaeProvider implements DpaeProvider {
  preparer({
    dossier,
    ouvrier,
    organisation
  }: {
    dossier: DossierEmbauche;
    ouvrier: User;
    organisation: Organisation;
  }): ChampDpae[] {
    const p = (organisation.parametres as Record<string, unknown>) ?? {};
    const champ = (
      cle: string,
      label: string,
      valeur: string | null | undefined,
      section: ChampDpae['section']
    ): ChampDpae => ({
      cle,
      label,
      valeur: (valeur ?? '').trim(),
      section,
      manquant: !(valeur ?? '').trim()
    });

    return [
      champ('employeurNom', 'Raison sociale', organisation.nom, 'Employeur'),
      champ('employeurMsa', 'N° employeur MSA', String(p.msaNumeroEmployeur ?? ''), 'Employeur'),
      champ('employeurSiret', 'SIRET', String(p.siret ?? ''), 'Employeur'),
      champ(
        'employeurAdresse',
        'Adresse de l’établissement',
        String(p.adresseEtablissement ?? ''),
        'Employeur'
      ),
      champ('nom', 'Nom de naissance', ouvrier.nom, 'Salarié'),
      champ('prenoms', 'Prénom(s)', ouvrier.prenom, 'Salarié'),
      champ(
        'dateNaissance',
        'Date de naissance',
        ouvrier.dateNaissance ? formatDate(ymd(ouvrier.dateNaissance)) : '',
        'Salarié'
      ),
      champ('lieuNaissance', 'Lieu de naissance', ouvrier.lieuNaissance, 'Salarié'),
      champ('nationalite', 'Nationalité', ouvrier.nationalite, 'Salarié'),
      {
        ...champ(
          'numeroSecu',
          'N° de sécurité sociale',
          dechiffreChamp(ouvrier.numeroSecu),
          'Salarié'
        ),
        ...(ouvrier.immatriculationEnCours
          ? { valeur: '', manquant: true, label: 'N° de sécurité sociale (immatriculation MSA à demander)' }
          : {})
      },
      champ('adresse', 'Adresse du salarié', ouvrier.adresse, 'Salarié'),
      champ('typeContrat', 'Nature du contrat', 'CDD saisonnier agricole', 'Contrat'),
      champ('dateEmbauche', 'Date d’embauche (prise de poste)', formatDate(ymd(dossier.dateDebut)), 'Contrat'),
      champ(
        'dateFinPrevue',
        'Date de fin prévue',
        dossier.dateFinPrevue ? formatDate(ymd(dossier.dateFinPrevue)) : '',
        'Contrat'
      ),
      champ('tauxHoraire', 'Salaire horaire brut (€)', Number(dossier.tauxHoraire).toFixed(2), 'Contrat')
    ];
  }
}

export const dpaeProvider: DpaeProvider = new ManualDpaeProvider();

/** Règle 4 : DPAE avant prise de poste — alerte si début ≤ demain et non déposée. */
export function dpaeUrgente(dossier: Pick<DossierEmbauche, 'dateDebut' | 'dpaeDeposeAt'>): boolean {
  if (dossier.dpaeDeposeAt) return false;
  const demain = new Date();
  demain.setDate(demain.getDate() + 1);
  demain.setHours(23, 59, 59, 999);
  return new Date(dossier.dateDebut) <= demain;
}
