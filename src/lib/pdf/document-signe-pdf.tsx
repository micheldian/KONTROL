import 'server-only';
import path from 'path';
import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  Image,
  Font,
  StyleSheet,
  renderToBuffer
} from '@react-pdf/renderer';

// PDF d'un document signé électroniquement (contrat, mutuelle) : texte rendu
// depuis le modèle + encart signature + page de traçabilité (qui, quand, quel
// appareil, quel mode). Le hash SHA-256 du PDF est calculé et stocké APRÈS
// génération (lib/documents.ts).

const FONTS = path.join(process.cwd(), 'public', 'fonts');
Font.register({
  family: 'DejaVu',
  fonts: [
    { src: path.join(FONTS, 'DejaVuSans.ttf') },
    { src: path.join(FONTS, 'DejaVuSans-Bold.ttf'), fontWeight: 'bold' }
  ]
});
Font.register({ family: 'DejaVuMono', src: path.join(FONTS, 'DejaVuSansMono.ttf') });

const s = StyleSheet.create({
  page: { fontFamily: 'DejaVu', fontSize: 9.5, padding: 46, lineHeight: 1.45, color: '#1A241F' },
  titre: { fontSize: 13, fontWeight: 'bold', marginBottom: 14 },
  para: { marginBottom: 6 },
  articleTitre: { fontWeight: 'bold', marginTop: 8, marginBottom: 4 },
  signatureBloc: {
    marginTop: 22,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#B8C4BD',
    borderTopStyle: 'dashed'
  },
  signatureImg: { width: 170, height: 75, objectFit: 'contain' },
  petits: { fontSize: 8, color: '#5C6B62' },
  tracaTitre: { fontSize: 12, fontWeight: 'bold', marginBottom: 12 },
  tracaLigne: { flexDirection: 'row', marginBottom: 5 },
  tracaLabel: { width: 170, color: '#5C6B62' },
  mono: { fontFamily: 'DejaVuMono', fontSize: 8 }
});

export type TracabiliteSignature = {
  signataire: string;
  telephone: string;
  horodatage: string; // déjà formaté Europe/Paris
  mode: 'DISTANT' | 'KIOSQUE';
  appareil: string;
  ipAdresse?: string | null;
  adminAccompagnant?: string | null;
  hashContenu: string; // SHA-256 du texte du document rendu
};

function Paragraphes({ texte }: { texte: string }) {
  return (
    <>
      {texte.split('\n').map((ligne, i) => {
        const estTitre = /^(Article|CONTRAT|MUTUELLE)/.test(ligne.trim());
        if (!ligne.trim()) return <Text key={i} style={{ marginBottom: 5 }}> </Text>;
        return (
          <Text key={i} style={estTitre ? s.articleTitre : s.para}>
            {ligne}
          </Text>
        );
      })}
    </>
  );
}

export async function renderDocumentSignePdf(params: {
  titre: string;
  organisation: string;
  texte: string; // modèle déjà rendu (variables injectées)
  imageSignature: string; // dataURL PNG
  traca: TracabiliteSignature;
}): Promise<Buffer> {
  const { titre, organisation, texte, imageSignature, traca } = params;
  const doc = (
    <Document title={titre} author={organisation} creator="Krontrol">
      <Page size="A4" style={s.page}>
        <Text style={s.titre}>{titre}</Text>
        <Paragraphes texte={texte} />
        <View style={s.signatureBloc} wrap={false}>
          <Text style={{ fontWeight: 'bold', marginBottom: 4 }}>
            Signature du·de la salarié·e — {traca.signataire}
          </Text>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src={imageSignature} style={s.signatureImg} />
          <Text style={s.petits}>
            Signé électroniquement le {traca.horodatage} · mode{' '}
            {traca.mode === 'KIOSQUE' ? 'kiosque (assisté)' : 'distant'}
          </Text>
        </View>
      </Page>

      {/* Page de traçabilité */}
      <Page size="A4" style={s.page}>
        <Text style={s.tracaTitre}>Page de traçabilité — signature électronique</Text>
        {(
          [
            ['Document', titre],
            ['Organisation', organisation],
            ['Signataire', `${traca.signataire} (${traca.telephone})`],
            ['Horodatage (Europe/Paris)', traca.horodatage],
            [
              'Mode de signature',
              traca.mode === 'KIOSQUE'
                ? 'Kiosque : parcours déroulé sur l’appareil de l’organisation, signature apposée par le·la salarié·e lui·elle-même'
                : 'Distant : parcours effectué sur l’appareil personnel du·de la salarié·e via lien sécurisé'
            ],
            ['Appareil', traca.appareil || '—'],
            ['Adresse IP', traca.ipAdresse || '—'],
            ['Admin accompagnant', traca.adminAccompagnant || '—']
          ] as Array<[string, string]>
        ).map(([label, valeur]) => (
          <View key={label} style={s.tracaLigne}>
            <Text style={s.tracaLabel}>{label}</Text>
            <Text style={{ flex: 1 }}>{valeur}</Text>
          </View>
        ))}
        <View style={[s.tracaLigne, { marginTop: 10 }]}>
          <Text style={s.tracaLabel}>Empreinte SHA-256 du contenu</Text>
          <Text style={[s.mono, { flex: 1 }]}>{traca.hashContenu}</Text>
        </View>
        <Text style={[s.petits, { marginTop: 24 }]}>
          Ce document a été généré et signé via Krontrol. L’empreinte SHA-256 du PDF final est
          stockée séparément et permet de vérifier son intégrité.
        </Text>
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}
