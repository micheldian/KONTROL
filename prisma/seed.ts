// Seed de développement : organisation Pickajob + comptes de test.
// Lancer avec : npx prisma db seed
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const TAGS = [
  'taille',
  'palissage',
  'vendanges',
  'relevage',
  'cueillette',
  'tracteur',
  'permis B',
  'chef d’équipe',
  'parle français'
];

async function main() {
  const org = await prisma.organisation.upsert({
    where: { id: 'org-pickajob' },
    update: {},
    create: {
      id: 'org-pickajob',
      nom: 'Pickajob',
      tarifHoraireBase: 12.5,
      parametres: { regleDepartLogementInclus: false }
    }
  });

  for (const libelle of TAGS) {
    await prisma.competenceTag.upsert({
      where: { organisationId_libelle: { organisationId: org.id, libelle } },
      update: {},
      create: { organisationId: org.id, libelle }
    });
  }

  const mdp = await bcrypt.hash('admin123', 10);
  const pin = await bcrypt.hash('1234', 10);

  await prisma.user.upsert({
    where: { telephone: '+33600000001' },
    update: {},
    create: {
      organisationId: org.id,
      role: 'ADMIN',
      statutProfil: 'ACTIF',
      nom: 'Dian',
      prenom: 'Michel',
      telephone: '+33600000001',
      email: 'admin@pickajob.fr',
      motDePasseHash: mdp,
      langue: 'FR'
    }
  });

  await prisma.user.upsert({
    where: { telephone: '+33600000002' },
    update: { role: 'MANAGER' },
    create: {
      organisationId: org.id,
      role: 'MANAGER',
      statutProfil: 'ACTIF',
      nom: 'Pickajob',
      prenom: 'Arthur',
      telephone: '+33600000002',
      email: 'manager@pickajob.fr',
      motDePasseHash: mdp,
      langue: 'FR'
    }
  });

  const chef = await prisma.user.upsert({
    where: { telephone: '+40711111111' },
    update: {},
    create: {
      organisationId: org.id,
      role: 'CHEF_EQUIPE',
      statutProfil: 'ACTIF',
      nom: 'Marinescu',
      prenom: 'Ion',
      telephone: '+40711111111',
      pinHash: pin,
      langue: 'RO',
      estChefEquipe: true,
      tauxHoraire: 14
    }
  });

  const vasile = await prisma.user.upsert({
    where: { telephone: '+40722222222' },
    update: {},
    create: {
      organisationId: org.id,
      role: 'OUVRIER',
      statutProfil: 'ACTIF',
      nom: 'Popescu',
      prenom: 'Vasile',
      telephone: '+40722222222',
      pinHash: pin,
      langue: 'RO'
    }
  });

  await prisma.user.upsert({
    where: { telephone: '+40733333333' },
    update: {},
    create: {
      organisationId: org.id,
      role: 'OUVRIER',
      statutProfil: 'ACTIF',
      nom: 'Stoica',
      prenom: 'Andrei',
      telephone: '+40733333333',
      pinHash: pin,
      langue: 'RO'
    }
  });

  await prisma.user.upsert({
    where: { telephone: '+34644444444' },
    update: {},
    create: {
      organisationId: org.id,
      role: 'OUVRIER',
      statutProfil: 'ACTIF',
      nom: 'García',
      prenom: 'José',
      telephone: '+34644444444',
      pinHash: pin,
      langue: 'ES'
    }
  });

  const schmitt = await prisma.client.upsert({
    where: { id: 'client-schmitt' },
    update: {},
    create: {
      id: 'client-schmitt',
      organisationId: org.id,
      nom: 'Domaine Schmitt',
      contact: 'Paul Schmitt',
      telephone: '+33388000001',
      adresse: '12 route des Vignes, Eguisheim',
      couleur: '#2E7D32'
    }
  });

  const muller = await prisma.client.upsert({
    where: { id: 'client-muller' },
    update: {},
    create: {
      id: 'client-muller',
      organisationId: org.id,
      nom: 'EARL Muller',
      contact: 'Anne Muller',
      telephone: '+33388000002',
      adresse: '4 chemin du Florimont, Ingersheim',
      couleur: '#F57C00'
    }
  });

  // Compte CLIENT de démo (portail /client, lecture seule)
  await prisma.user.upsert({
    where: { telephone: '+33388000001' },
    update: { role: 'CLIENT', clientId: schmitt.id },
    create: {
      organisationId: org.id,
      role: 'CLIENT',
      statutProfil: 'ACTIF',
      nom: 'Schmitt',
      prenom: 'Paul',
      telephone: '+33388000001',
      email: 'client@domaine-schmitt.fr',
      motDePasseHash: mdp,
      langue: 'FR',
      clientId: schmitt.id
    }
  });

  const annee = new Date().getFullYear();

  const missionSchmitt = await prisma.mission.upsert({
    where: { id: 'mission-schmitt-relevage' },
    update: {},
    create: {
      id: 'mission-schmitt-relevage',
      organisationId: org.id,
      clientId: schmitt.id,
      libelle: 'Relevage Est',
      typeTravaux: 'Relevage',
      modeFacturation: 'HEURE',
      tauxClient: 26,
      dateDebut: new Date(`${annee}-05-01T00:00:00Z`)
    }
  });

  // Petit carré de démo autour d'un centroïde (remplacé par la vraie géométrie IGN à l'usage)
  const carre = (lat: number, lng: number, d = 0.0012) => ({
    type: 'MultiPolygon',
    coordinates: [
      [
        [
          [lng - d, lat - d],
          [lng + d, lat - d],
          [lng + d, lat + d],
          [lng - d, lat + d],
          [lng - d, lat - d]
        ]
      ]
    ]
  });

  await prisma.parcelle.upsert({
    where: { id: 'parcelle-schmitt-est' },
    update: { clientId: schmitt.id, organisationId: org.id },
    create: {
      id: 'parcelle-schmitt-est',
      organisationId: org.id,
      clientId: schmitt.id,
      codeInsee: '68078',
      commune: 'Eguisheim',
      section: 'AB',
      numero: '0123',
      geometry: carre(48.0431, 7.2977),
      centroidLat: 48.0431,
      centroidLng: 7.2977,
      surfaceM2: 5200,
      adresse: '12 route des Vignes, Eguisheim',
      cepage: 'Riesling',
      millesime: 2021,
      instructions: 'Relevage parcelle Est. Apporter sécateurs.'
    }
  });

  const missionMuller = await prisma.mission.upsert({
    where: { id: 'mission-muller-palissage' },
    update: {},
    create: {
      id: 'mission-muller-palissage',
      organisationId: org.id,
      clientId: muller.id,
      libelle: 'Palissage',
      typeTravaux: 'Palissage',
      modeFacturation: 'TACHE',
      montantForfait: 4200,
      dateDebut: new Date(`${annee}-05-15T00:00:00Z`)
    }
  });

  await prisma.parcelle.upsert({
    where: { id: 'parcelle-muller-florimont' },
    update: { clientId: muller.id, organisationId: org.id },
    create: {
      id: 'parcelle-muller-florimont',
      organisationId: org.id,
      clientId: muller.id,
      codeInsee: '68155',
      commune: 'Ingersheim',
      section: 'AC',
      numero: '0045',
      geometry: carre(48.0968, 7.3052),
      centroidLat: 48.0968,
      centroidLng: 7.3052,
      surfaceM2: 8400,
      adresse: '4 chemin du Florimont, Ingersheim',
      cepage: 'Gewurztraminer',
      millesime: 2019,
      instructions: 'Pause 30 min à 13h. Eau fournie sur place.'
    }
  });

  const logement = await prisma.logement.upsert({
    where: { id: 'logement-mommenheim' },
    update: {},
    create: {
      id: 'logement-mommenheim',
      organisationId: org.id,
      nom: 'Maison Mommenheim',
      adresse: '3 rue des Champs, Mommenheim',
      capacite: 8,
      tarifJour: 12
    }
  });

  const moisCourant = new Date().toISOString().slice(0, 7);
  await prisma.sejourLogement.upsert({
    where: { id: 'sejour-vasile' },
    update: {},
    create: {
      id: 'sejour-vasile',
      logementId: logement.id,
      userId: vasile.id,
      dateArrivee: new Date(`${moisCourant}-01T00:00:00Z`)
    }
  });

  // Affectations de démo pour aujourd'hui (publiées)
  const aujourdhui = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' }) + 'T00:00:00Z');
  const andrei = await prisma.user.findUnique({ where: { telephone: '+40733333333' } });

  const aff1 = await prisma.affectation.upsert({
    where: { id: 'aff-demo-schmitt' },
    update: { date: aujourdhui },
    create: {
      id: 'aff-demo-schmitt',
      organisationId: org.id,
      date: aujourdhui,
      missionId: missionSchmitt.id,
      heureDebut: '07:30',
      heureFinPrevue: '11:00',
      pauseMinutesPrevue: 0,
      chefEquipeId: chef.id,
      instructions: 'Relevage parcelle Est. Apporter sécateurs.',
      publieAt: new Date()
    }
  });
  const aff2 = await prisma.affectation.upsert({
    where: { id: 'aff-demo-muller' },
    update: { date: aujourdhui },
    create: {
      id: 'aff-demo-muller',
      organisationId: org.id,
      date: aujourdhui,
      missionId: missionMuller.id,
      heureDebut: '11:30',
      heureFinPrevue: '18:00',
      pauseMinutesPrevue: 30,
      instructions: 'Pause 30 min à 13h. Eau fournie sur place.',
      publieAt: new Date()
    }
  });
  for (const [affId, parcId] of [
    [aff1.id, 'parcelle-schmitt-est'],
    [aff2.id, 'parcelle-muller-florimont']
  ] as const) {
    await prisma.affectationParcelle.upsert({
      where: { affectationId_parcelleId: { affectationId: affId, parcelleId: parcId } },
      update: {},
      create: { affectationId: affId, parcelleId: parcId }
    });
  }
  for (const [affId, userIds] of [
    [aff1.id, [chef.id, vasile.id, andrei!.id]],
    [aff2.id, [vasile.id]]
  ] as const) {
    for (const uid of userIds) {
      await prisma.affectationOuvrier.upsert({
        where: { affectationId_userId: { affectationId: affId, userId: uid } },
        update: {},
        create: { affectationId: affId, userId: uid }
      });
    }
  }

  // Candidat de démo (portail /rejoindre) + candidature à valider
  const candidat = await prisma.user.upsert({
    where: { telephone: '+40755555555' },
    update: {},
    create: {
      organisationId: org.id,
      role: 'OUVRIER',
      statutProfil: 'CANDIDAT',
      nom: 'Ionescu',
      prenom: 'Mihai',
      telephone: '+40755555555',
      langue: 'RO',
      experienceDeclaree: '3 saisons de vendanges en Champagne, taille hiver 2024',
      source: 'PORTAIL'
    }
  });
  const tagTaille = await prisma.competenceTag.findUnique({
    where: { organisationId_libelle: { organisationId: org.id, libelle: 'taille' } }
  });
  if (tagTaille) {
    await prisma.userCompetence.upsert({
      where: { userId_tagId: { userId: candidat.id, tagId: tagTaille.id } },
      update: {},
      create: { userId: candidat.id, tagId: tagTaille.id }
    });
  }
  const dejaCandidature = await prisma.candidature.findFirst({
    where: { userId: candidat.id }
  });
  if (!dejaCandidature) {
    await prisma.candidature.create({
      data: { organisationId: org.id, userId: candidat.id }
    });
  }

  console.log('Seed OK — admin@pickajob.fr / admin123 · ouvrier +40722222222 PIN 1234');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
