import 'server-only';
import type { DossierEmbauche, Logement, Organisation, User } from '@prisma/client';
import { formatDate, formatEuros, todayParis, ymd } from '@/lib/dates';

// Moteur de modèles de documents (phase 18) : texte avec variables {{cle}},
// géré dans les Paramètres (plusieurs modèles possibles). Les modèles exacts
// (contrat CDD saisonnier, formulaires mutuelle de l'organisme) seront fournis
// plus tard — placeholders substituables ci-dessous.

export function rendreTemplate(contenu: string, variables: Record<string, string>): string {
  return contenu.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, cle: string) =>
    variables[cle] !== undefined && variables[cle] !== '' ? variables[cle] : `[${cle} ?]`
  );
}

export function variablesManquantes(contenu: string, variables: Record<string, string>): string[] {
  const manquantes: string[] = [];
  contenu.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (tout, cle: string) => {
    if (!variables[cle] && !manquantes.includes(cle)) manquantes.push(cle);
    return tout;
  });
  return manquantes;
}

/** Variables injectées dans les contrats et formulaires mutuelle. */
export function variablesDossier(params: {
  dossier: DossierEmbauche;
  ouvrier: User;
  organisation: Organisation;
  logement?: Logement | null;
}): Record<string, string> {
  const { dossier, ouvrier, organisation, logement } = params;
  const p = (organisation.parametres as Record<string, unknown>) ?? {};
  return {
    organisation: organisation.nom,
    organisationAdresse: String(p.adresseEtablissement ?? ''),
    numeroEmployeurMsa: String(p.msaNumeroEmployeur ?? ''),
    prenom: ouvrier.prenom,
    nom: ouvrier.nom,
    dateNaissance: ouvrier.dateNaissance ? formatDate(ymd(ouvrier.dateNaissance)) : '',
    lieuNaissance: ouvrier.lieuNaissance ?? '',
    nationalite: ouvrier.nationalite ?? '',
    adresse: ouvrier.adresse ?? '',
    telephone: ouvrier.telephone,
    dateDebut: formatDate(ymd(dossier.dateDebut)),
    dateFinPrevue: dossier.dateFinPrevue ? formatDate(ymd(dossier.dateFinPrevue)) : '',
    tauxHoraire: formatEuros(Number(dossier.tauxHoraire)),
    logement: logement ? `${logement.nom}${logement.adresse ? ` — ${logement.adresse}` : ''}` : '',
    tarifLogementJour: logement ? formatEuros(Number(logement.tarifJour)) : '',
    dateJour: formatDate(todayParis())
  };
}

export const VARIABLES_DISPONIBLES = [
  'organisation',
  'organisationAdresse',
  'numeroEmployeurMsa',
  'prenom',
  'nom',
  'dateNaissance',
  'lieuNaissance',
  'nationalite',
  'adresse',
  'telephone',
  'dateDebut',
  'dateFinPrevue',
  'tauxHoraire',
  'logement',
  'tarifLogementJour',
  'dateJour'
];

// ————— Modèles placeholder (à remplacer par les vrais documents, section F) —————

export const MODELE_CONTRAT_DEFAUT = `CONTRAT DE TRAVAIL À DURÉE DÉTERMINÉE — TRAVAILLEUR SAISONNIER AGRICOLE

Entre l'employeur :
{{organisation}}, {{organisationAdresse}}
N° employeur MSA : {{numeroEmployeurMsa}}

et le·la salarié·e :
{{prenom}} {{nom}}, né·e le {{dateNaissance}} à {{lieuNaissance}}, de nationalité {{nationalite}},
demeurant : {{adresse}}
Téléphone : {{telephone}}

Article 1 — Objet et motif
Le présent contrat est conclu pour un emploi à caractère saisonnier (article L.1242-2 3° du
Code du travail) : travaux agricoles saisonniers.

Article 2 — Durée
Le contrat prend effet le {{dateDebut}}. Il est conclu pour la durée de la saison, avec un
terme prévu le {{dateFinPrevue}}.
Il comporte une période d'essai dans les conditions légales.

Article 3 — Rémunération
Le·la salarié·e percevra une rémunération horaire brute de {{tauxHoraire}}, payée
mensuellement, selon les heures effectivement travaillées et validées.

Article 4 — Logement
{{logement}}
Le cas échéant, une participation de {{tarifLogementJour}} par jour est retenue sur salaire.

Article 5 — Dispositions générales
Le·la salarié·e est affilié·e à la MSA. Il·elle bénéficie des dispositions de la convention
collective applicable à l'exploitation.

⚠ MODÈLE PROVISOIRE — à remplacer par le modèle définitif de l'organisation dans
Paramètres → Modèles de documents.

Fait à {{organisationAdresse}}, le {{dateJour}}.`;

export const MODELE_MUTUELLE_ADHESION_DEFAUT = `MUTUELLE D'ENTREPRISE — BULLETIN D'ADHÉSION

Salarié·e : {{prenom}} {{nom}}, né·e le {{dateNaissance}}
Employeur : {{organisation}}
Date d'effet : {{dateDebut}}

Je soussigné·e {{prenom}} {{nom}} demande mon adhésion à la couverture frais de santé
collective mise en place par {{organisation}}, à compter du {{dateDebut}}.

⚠ FORMULAIRE PROVISOIRE — le bulletin officiel de l'organisme sera substitué dans
Paramètres → Modèles de documents.

Fait le {{dateJour}}.`;

export const MODELE_MUTUELLE_DISPENSE_DEFAUT = `MUTUELLE D'ENTREPRISE — DEMANDE DE DISPENSE D'ADHÉSION

Salarié·e : {{prenom}} {{nom}}, né·e le {{dateNaissance}}
Employeur : {{organisation}}

Je soussigné·e {{prenom}} {{nom}} demande à être dispensé·e d'adhésion à la couverture
frais de santé collective, pour le motif suivant :

Motif : {{motifDispense}}

J'ai été informé·e des conséquences de ce choix et je reconnais avoir reçu une information
complète sur les garanties proposées.

⚠ FORMULAIRE PROVISOIRE — le formulaire officiel de l'organisme sera substitué dans
Paramètres → Modèles de documents.

Fait le {{dateJour}}.`;

export const MOTIFS_DISPENSE = [
  'Déjà couvert·e par une complémentaire santé individuelle',
  'Ayant droit de la mutuelle de mon conjoint / de ma famille',
  'Bénéficiaire de la Complémentaire santé solidaire (C2S)',
  'CDD ≤ 3 mois avec couverture individuelle responsable',
  'Autre motif légal (préciser)'
];
