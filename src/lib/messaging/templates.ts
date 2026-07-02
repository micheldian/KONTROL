// Templates de messages multilingues (FR/RO/ES).
// Défauts dans le code, surchargeables par organisation via parametres.templates
// (édition dans Paramètres, phase 12).

export type TemplateContexte = 'AFFECTATION' | 'RECAP' | 'VIVIER';
export type LangueCode = 'FR' | 'RO' | 'ES';

const DEFAUTS: Record<TemplateContexte, Record<LangueCode, string>> = {
  AFFECTATION: {
    FR: 'Bonjour {prenom} 👋\n🌿 MISSION — {date}\nClient : {client} — {mission}\nTravaux : {travaux}\n🕖 {heure}\n{parcelles}\n{instructions}',
    RO: 'Bună ziua {prenom} 👋\n🌿 MISIUNE — {date}\nClient: {client} — {mission}\nLucrări: {travaux}\n🕖 {heure}\n{parcelles}\n{instructions}',
    ES: 'Hola {prenom} 👋\n🌿 MISIÓN — {date}\nCliente: {client} — {mission}\nTrabajos: {travaux}\n🕖 {heure}\n{parcelles}\n{instructions}'
  },
  RECAP: {
    FR: 'Bonjour {prenom}, votre récapitulatif {mois} est prêt : net à recevoir {net}. Ouvrez Krontrol pour le détail.',
    RO: 'Bună ziua {prenom}, recapitularea {mois} este gata: net de primit {net}. Deschideți Krontrol pentru detalii.',
    ES: 'Hola {prenom}, su resumen de {mois} está listo: neto a recibir {net}. Abra Krontrol para el detalle.'
  },
  VIVIER: {
    FR: 'Bonjour {prenom}, c’est {organisation} : on a une mission pour vous ! Répondez à ce message ou rappelez-nous.',
    RO: 'Bună ziua {prenom}, suntem {organisation}: avem o misiune pentru dvs.! Răspundeți la acest mesaj sau sunați-ne.',
    ES: 'Hola {prenom}, somos {organisation}: ¡tenemos una misión para usted! Responda a este mensaje o llámenos.'
  }
};

/** Rend un template avec ses variables ; les lignes vides résiduelles sont nettoyées. */
export function renduTemplate(
  contexte: TemplateContexte,
  langue: LangueCode,
  vars: Record<string, string>,
  surcharges?: unknown
): string {
  let tpl: string | undefined;
  if (surcharges && typeof surcharges === 'object') {
    const s = surcharges as Record<string, Record<string, string>>;
    tpl = s[contexte]?.[langue];
  }
  tpl = tpl ?? DEFAUTS[contexte][langue] ?? DEFAUTS[contexte].FR;
  const rendu = tpl.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');
  return rendu
    .split('\n')
    .filter((l) => l.trim() !== '')
    .join('\n');
}

export function templatesParDefaut() {
  return DEFAUTS;
}
