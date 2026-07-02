// Messages des notifications push, dans la langue de l'ouvrier.

type Langue = 'FR' | 'RO' | 'ES';

export const PUSH_MESSAGES: Record<
  'AFFECTATION_PUBLIEE' | 'ACOMPTE_APPROUVE' | 'ACOMPTE_REFUSE' | 'RECAP_DISPONIBLE',
  Record<Langue, { title: string; body: string; url: string }>
> = {
  AFFECTATION_PUBLIEE: {
    FR: { title: 'Krontrol', body: '📅 Nouvelle mission publiée — regardez votre planning', url: '/app' },
    RO: { title: 'Krontrol', body: '📅 Misiune nouă publicată — verificați programul', url: '/app' },
    ES: { title: 'Krontrol', body: '📅 Nueva misión publicada — mire su planning', url: '/app' }
  },
  ACOMPTE_APPROUVE: {
    FR: { title: 'Krontrol', body: '💶 Votre demande d’acompte a été approuvée', url: '/app/argent' },
    RO: { title: 'Krontrol', body: '💶 Cererea dvs. de avans a fost aprobată', url: '/app/argent' },
    ES: { title: 'Krontrol', body: '💶 Su solicitud de anticipo ha sido aprobada', url: '/app/argent' }
  },
  ACOMPTE_REFUSE: {
    FR: { title: 'Krontrol', body: 'Votre demande d’acompte a été refusée — voyez le bureau', url: '/app/argent' },
    RO: { title: 'Krontrol', body: 'Cererea dvs. de avans a fost refuzată — vedeți biroul', url: '/app/argent' },
    ES: { title: 'Krontrol', body: 'Su solicitud de anticipo fue rechazada — consulte la oficina', url: '/app/argent' }
  },
  RECAP_DISPONIBLE: {
    FR: { title: 'Krontrol', body: '🧾 Votre récapitulatif du mois est disponible', url: '/app/argent' },
    RO: { title: 'Krontrol', body: '🧾 Recapitularea lunii este disponibilă', url: '/app/argent' },
    ES: { title: 'Krontrol', body: '🧾 Su resumen del mes está disponible', url: '/app/argent' }
  }
};
