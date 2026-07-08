import 'server-only';

// ZIP minimal (méthode STORE, sans compression) en pur TypeScript — suffisant
// pour l'export « dossier de contrôle MSA » : les photos JPEG et les PDF sont
// déjà compressés, re-compresser n'apporterait rien.

const TABLE_CRC = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(donnees: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < donnees.length; i++) {
    crc = TABLE_CRC[(crc ^ donnees[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dateDos(d: Date): { date: number; heure: number } {
  return {
    date: (((d.getFullYear() - 1980) & 0x7f) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    heure: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)
  };
}

export type FichierZip = { nom: string; contenu: Buffer; modifieLe?: Date };

/** Construit une archive ZIP (STORE). Les noms sont encodés UTF-8 (flag bit 11). */
export function construireZip(fichiers: FichierZip[]): Buffer {
  const morceaux: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const f of fichiers) {
    const nom = Buffer.from(f.nom.replace(/\\/g, '/'), 'utf8');
    const { date, heure } = dateDos(f.modifieLe ?? new Date());
    const crc = crc32(f.contenu);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version
    local.writeUInt16LE(0x0800, 6); // flag : noms UTF-8
    local.writeUInt16LE(0, 8); // méthode STORE
    local.writeUInt16LE(heure, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(f.contenu.length, 18);
    local.writeUInt32LE(f.contenu.length, 22);
    local.writeUInt16LE(nom.length, 26);
    local.writeUInt16LE(0, 28);
    morceaux.push(local, nom, f.contenu);

    const centrale = Buffer.alloc(46);
    centrale.writeUInt32LE(0x02014b50, 0);
    centrale.writeUInt16LE(20, 4);
    centrale.writeUInt16LE(20, 6);
    centrale.writeUInt16LE(0x0800, 8);
    centrale.writeUInt16LE(0, 10);
    centrale.writeUInt16LE(heure, 12);
    centrale.writeUInt16LE(date, 14);
    centrale.writeUInt32LE(crc, 16);
    centrale.writeUInt32LE(f.contenu.length, 20);
    centrale.writeUInt32LE(f.contenu.length, 24);
    centrale.writeUInt16LE(nom.length, 28);
    centrale.writeUInt32LE(offset, 42);
    central.push(centrale, nom);

    offset += 30 + nom.length + f.contenu.length;
  }

  const tailleCentral = central.reduce((s, b) => s + b.length, 0);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(fichiers.length, 8);
  fin.writeUInt16LE(fichiers.length, 10);
  fin.writeUInt32LE(tailleCentral, 12);
  fin.writeUInt32LE(offset, 16);

  return Buffer.concat([...morceaux, ...central, fin]);
}
