import 'server-only';

// OCR des documents d'embauche (phase 18). Règle 1 : l'OCR PROPOSE, l'humain
// CONFIRME — les champs extraits pré-remplissent un écran de confirmation,
// jamais d'enregistrement aveugle.
//
// Provider isolé : vision Claude (API Anthropic) si une clé est posée
// (parametres.anthropicApiKey de l'organisation ou env ANTHROPIC_API_KEY),
// sinon statut SIMULE → saisie manuelle (le parcours reste utilisable).

export type OcrIdentite = {
  nom?: string;
  prenoms?: string;
  dateNaissance?: string; // YYYY-MM-DD
  lieuNaissance?: string;
  nationalite?: string;
  typeDocument?: string; // CNI, passeport, titre de séjour…
  numeroDocument?: string;
  dateExpiration?: string; // YYYY-MM-DD
  adresse?: string; // présente sur les CNI roumaines, absente des passeports
};

export type OcrResultat<T> = { statut: 'OK' | 'SIMULE' | 'ECHEC'; champs: T; erreur?: string };

export function cleOcr(parametresOrg: unknown): string {
  const p = (parametresOrg as Record<string, unknown>) ?? {};
  return ((p.anthropicApiKey as string) || process.env.ANTHROPIC_API_KEY || '').trim();
}

async function visionJson<T>(params: {
  cle: string;
  imageBase64: string;
  mimeType: string;
  instruction: string;
}): Promise<OcrResultat<T>> {
  if (!params.cle) return { statut: 'SIMULE', champs: {} as T };
  try {
    const reponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': params.cle,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 700,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: params.mimeType,
                  data: params.imageBase64
                }
              },
              { type: 'text', text: params.instruction }
            ]
          }
        ]
      }),
      signal: AbortSignal.timeout(30000)
    });
    if (!reponse.ok) {
      return { statut: 'ECHEC', champs: {} as T, erreur: `API ${reponse.status}` };
    }
    const corps = (await reponse.json()) as { content?: Array<{ type: string; text?: string }> };
    const texte = corps.content?.find((c) => c.type === 'text')?.text ?? '';
    const json = texte.match(/\{[\s\S]*\}/)?.[0];
    if (!json) return { statut: 'ECHEC', champs: {} as T, erreur: 'réponse sans JSON' };
    const brut = JSON.parse(json) as Record<string, unknown>;
    const champs: Record<string, string> = {};
    for (const [k, v] of Object.entries(brut)) {
      if (typeof v === 'string' && v.trim() && v.trim().toLowerCase() !== 'null') {
        champs[k] = v.trim();
      }
    }
    return { statut: 'OK', champs: champs as T };
  } catch (e) {
    return {
      statut: 'ECHEC',
      champs: {} as T,
      erreur: e instanceof Error ? e.message : 'erreur OCR'
    };
  }
}

export async function ocrPieceIdentite(
  imageBase64: string,
  mimeType: string,
  cle: string
): Promise<OcrResultat<OcrIdentite>> {
  return visionJson<OcrIdentite>({
    cle,
    imageBase64,
    mimeType,
    instruction: `Ceci est la photo d'une pièce d'identité (CNI, passeport ou titre de séjour, souvent roumaine, espagnole ou française). Lis la bande MRZ si présente ET la zone visuelle, croise les deux. Réponds UNIQUEMENT avec un objet JSON (aucun texte autour) avec ces clés (string ou null si illisible/absent) :
{"nom": "...", "prenoms": "...", "dateNaissance": "YYYY-MM-DD", "lieuNaissance": "...", "nationalite": "...", "typeDocument": "CNI|Passeport|Titre de séjour", "numeroDocument": "...", "dateExpiration": "YYYY-MM-DD", "adresse": "adresse complète si présente sur le document (les CNI roumaines la portent), sinon null"}`
  });
}

export async function ocrCarteVitale(
  imageBase64: string,
  mimeType: string,
  cle: string
): Promise<OcrResultat<{ numeroSecu?: string; nom?: string; prenoms?: string }>> {
  return visionJson({
    cle,
    imageBase64,
    mimeType,
    instruction: `Ceci est la photo d'une carte vitale française (ou attestation de sécurité sociale). Réponds UNIQUEMENT avec un objet JSON : {"numeroSecu": "numéro de sécurité sociale à 13 ou 15 chiffres sans espaces, ou null", "nom": "...", "prenoms": "..."}`
  });
}

export async function ocrRib(
  imageBase64: string,
  mimeType: string,
  cle: string
): Promise<OcrResultat<{ iban?: string; bic?: string; titulaire?: string }>> {
  return visionJson({
    cle,
    imageBase64,
    mimeType,
    instruction: `Ceci est la photo d'un RIB (relevé d'identité bancaire). Réponds UNIQUEMENT avec un objet JSON : {"iban": "IBAN sans espaces ou null", "bic": "...", "titulaire": "..."}`
  });
}

/** Validation IBAN (mod 97) — pour vérifier la saisie/l'OCR côté serveur. */
export function ibanValide(iban: string): boolean {
  const nettoye = iban.replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(nettoye)) return false;
  const rearrange = nettoye.slice(4) + nettoye.slice(0, 4);
  let reste = 0;
  for (const c of rearrange) {
    const v = c >= 'A' ? String(c.charCodeAt(0) - 55) : c;
    for (const d of v) reste = (reste * 10 + Number(d)) % 97;
  }
  return reste === 1;
}

/** Numéro de sécu français : 13 chiffres (+ clé 2 optionnelle). */
export function numeroSecuValide(numero: string): boolean {
  const n = numero.replace(/\s/g, '');
  return /^[12]\d{12}(\d{2})?$/.test(n);
}
