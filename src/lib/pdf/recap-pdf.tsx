import 'server-only';
import path from 'path';
import {
  Document,
  Page,
  Text,
  View,
  Font,
  StyleSheet,
  renderToBuffer
} from '@react-pdf/renderer';
import type { ClotureMois, User, Organisation } from '@prisma/client';

// Police embarquée (diacritiques RO/ES). Les fichiers sont dans public/fonts
// et inclus dans le bundle serverless via outputFileTracingIncludes.
const FONTS = path.join(process.cwd(), 'public', 'fonts');
Font.register({
  family: 'DejaVu',
  fonts: [
    { src: path.join(FONTS, 'DejaVuSans.ttf') },
    { src: path.join(FONTS, 'DejaVuSans-Bold.ttf'), fontWeight: 'bold' }
  ]
});
Font.register({ family: 'DejaVuMono', src: path.join(FONTS, 'DejaVuSansMono.ttf') });

const I18N: Record<string, Record<string, string>> = {
  FR: {
    titre: 'Récapitulatif mensuel',
    ouvrier: 'Ouvrier',
    heures: 'Heures validées',
    brut: 'Total brut',
    acomptes: 'Acomptes reçus',
    logement: 'Logement',
    retenues: 'Retenues',
    net: 'NET À RECEVOIR',
    jours: 'jours',
    verse: 'Versé le',
    mode_ESPECES: 'en espèces',
    mode_VIREMENT: 'par virement',
    genere: 'Document généré par Krontrol'
  },
  RO: {
    titre: 'Recapitulare lunară',
    ouvrier: 'Muncitor',
    heures: 'Ore validate',
    brut: 'Total brut',
    acomptes: 'Avansuri primite',
    logement: 'Cazare',
    retenues: 'Rețineri',
    net: 'NET DE PRIMIT',
    jours: 'zile',
    verse: 'Plătit la',
    mode_ESPECES: 'în numerar',
    mode_VIREMENT: 'prin transfer',
    genere: 'Document generat de Krontrol'
  },
  ES: {
    titre: 'Resumen mensual',
    ouvrier: 'Trabajador',
    heures: 'Horas validadas',
    brut: 'Total bruto',
    acomptes: 'Anticipos recibidos',
    logement: 'Alojamiento',
    retenues: 'Retenciones',
    net: 'NETO A RECIBIR',
    jours: 'días',
    verse: 'Pagado el',
    mode_ESPECES: 'en efectivo',
    mode_VIREMENT: 'por transferencia',
    genere: 'Documento generado por Krontrol'
  }
};

const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

const styles = StyleSheet.create({
  page: {
    fontFamily: 'DejaVu',
    fontSize: 10,
    padding: 40,
    backgroundColor: '#F6F4EE',
    color: '#14241C'
  },
  ticket: {
    backgroundColor: '#FFFFFF',
    padding: 24,
    borderRadius: 4
  },
  logo: {
    fontFamily: 'DejaVuMono',
    fontSize: 14,
    textAlign: 'center',
    letterSpacing: 4,
    marginBottom: 2,
    fontWeight: 'bold'
  },
  sub: { textAlign: 'center', color: '#67746C', fontSize: 9, marginBottom: 14 },
  ligne: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3
  },
  libelle: { fontSize: 10 },
  libelle2: { fontSize: 8, color: '#67746C' },
  montant: { fontFamily: 'DejaVuMono', fontSize: 10 },
  detail: { fontSize: 8, color: '#67746C', marginBottom: 2 },
  sep: {
    borderBottomWidth: 1,
    borderBottomColor: '#DDD8CC',
    borderStyle: 'dashed',
    marginVertical: 8
  },
  netBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#14241C',
    padding: 10,
    borderRadius: 6,
    marginTop: 10
  },
  netLibelle: { color: '#FFAD0D', fontSize: 9, letterSpacing: 2 },
  netMontant: { color: '#FFAD0D', fontFamily: 'DejaVuMono', fontSize: 16, fontWeight: 'bold' },
  footer: { textAlign: 'center', color: '#67746C', fontSize: 7, marginTop: 20 }
});

type Snapshot = {
  lignesHeures: { taux: number; heures: number; montant: number }[];
  acomptes: { date: string; montant: number; mode: string | null }[];
  logement: { jours: number; total: number; sejours: { nom: string; jours: number; tarifJour: number; total: number }[] };
  retenues: { date: string; libelle: string; montant: number }[];
};

function eur(n: number) {
  return `${n.toFixed(2).replace('.', ',')} €`;
}

/** Ligne bilingue : libellé FR + traduction dans la langue de l'ouvrier si ≠ FR. */
function Ligne({
  fr,
  autre,
  montant,
  negatif
}: {
  fr: string;
  autre?: string;
  montant: string;
  negatif?: boolean;
}) {
  return (
    <View style={styles.ligne}>
      <View>
        <Text style={styles.libelle}>{fr}</Text>
        {autre ? <Text style={styles.libelle2}>{autre}</Text> : null}
      </View>
      <Text style={[styles.montant, negatif ? { color: '#C2410C' } : {}]}>{montant}</Text>
    </View>
  );
}

export function RecapDocument({
  cloture,
  ouvrier,
  organisation
}: {
  cloture: ClotureMois;
  ouvrier: User;
  organisation: Organisation;
}) {
  const langue = ouvrier.langue as keyof typeof I18N;
  const fr = I18N.FR;
  const lg = I18N[langue] ?? I18N.FR;
  const bilingue = langue !== 'FR';
  const snap = cloture.donnees as unknown as Snapshot;
  const periode = `${MOIS_FR[cloture.mois - 1]} ${cloture.annee}`;

  const t2 = (k: string) => (bilingue ? lg[k] : undefined);

  return (
    <Document title={`Krontrol — ${periode} — ${ouvrier.prenom} ${ouvrier.nom}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.ticket}>
          <Text style={styles.logo}>KRONTROL</Text>
          <Text style={styles.sub}>
            {organisation.nom} · {fr.titre}
            {bilingue ? ` / ${lg.titre}` : ''} — {periode}
          </Text>
          <Text style={[styles.sub, { fontSize: 10, color: '#14241C' }]}>
            {ouvrier.prenom} {ouvrier.nom} · {ouvrier.telephone}
          </Text>

          {snap.lignesHeures.map((l, i) => (
            <Ligne
              key={i}
              fr={`${fr.heures} : ${l.heures.toFixed(2).replace('.', ',')} h × ${eur(l.taux)}`}
              autre={t2('heures') && `${lg.heures}: ${l.heures.toFixed(2).replace('.', ',')} h`}
              montant={`= ${eur(l.montant)}`}
            />
          ))}
          <Ligne
            fr={fr.brut}
            autre={t2('brut')}
            montant={eur(Number(cloture.totalBrut))}
          />

          <View style={styles.sep} />

          {Number(cloture.totalAcomptes) > 0 && (
            <>
              <Ligne
                fr={fr.acomptes}
                autre={t2('acomptes')}
                montant={`− ${eur(Number(cloture.totalAcomptes))}`}
                negatif
              />
              {snap.acomptes.map((a, i) => (
                <Text key={i} style={styles.detail}>
                  {a.date} : {eur(a.montant)}
                  {a.mode ? ` (${fr[`mode_${a.mode}`] ?? a.mode})` : ''}
                </Text>
              ))}
            </>
          )}

          {Number(cloture.totalLogement) > 0 && (
            <>
              <Ligne
                fr={`${fr.logement} (${snap.logement.jours} ${fr.jours})`}
                autre={t2('logement') && `${lg.logement} (${snap.logement.jours} ${lg.jours})`}
                montant={`− ${eur(Number(cloture.totalLogement))}`}
                negatif
              />
              {snap.logement.sejours.map((s, i) => (
                <Text key={i} style={styles.detail}>
                  {s.nom} : {s.jours} j × {eur(s.tarifJour)}
                </Text>
              ))}
            </>
          )}

          {Number(cloture.totalRetenues) > 0 && (
            <>
              <Ligne
                fr={fr.retenues}
                autre={t2('retenues')}
                montant={`− ${eur(Number(cloture.totalRetenues))}`}
                negatif
              />
              {snap.retenues.map((r, i) => (
                <Text key={i} style={styles.detail}>
                  {r.date} · {r.libelle} : {eur(r.montant)}
                </Text>
              ))}
            </>
          )}

          <View style={styles.sep} />

          <View style={styles.netBox}>
            <View>
              <Text style={styles.netLibelle}>{fr.net}</Text>
              {bilingue && <Text style={styles.netLibelle}>{lg.net}</Text>}
            </View>
            <Text style={styles.netMontant}>{eur(Number(cloture.netAVerser))}</Text>
          </View>

          {cloture.verseAt && cloture.modeVersement && (
            <Text style={[styles.detail, { marginTop: 10, textAlign: 'center' }]}>
              {fr.verse} {cloture.verseAt.toLocaleDateString('fr-FR')}{' '}
              {fr[`mode_${cloture.modeVersement}`]}
              {bilingue
                ? ` / ${lg.verse} ${cloture.verseAt.toLocaleDateString('fr-FR')} ${lg[`mode_${cloture.modeVersement}`]}`
                : ''}
            </Text>
          )}
        </View>
        <Text style={styles.footer}>
          {fr.genere}
          {bilingue ? ` / ${lg.genere}` : ''} — {new Date().toLocaleDateString('fr-FR')}
        </Text>
      </Page>
    </Document>
  );
}

export async function renderRecapPdf(params: {
  cloture: ClotureMois;
  ouvrier: User;
  organisation: Organisation;
}): Promise<Buffer> {
  return renderToBuffer(
    <RecapDocument
      cloture={params.cloture}
      ouvrier={params.ouvrier}
      organisation={params.organisation}
    />
  );
}
