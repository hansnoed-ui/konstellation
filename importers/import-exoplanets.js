// Import: NASA Exoplanet Archive, Tabelle «pscomppars» (Planetary Systems Composite Parameters),
// genau eine Zeile je Planet. Zugriff über den dokumentierten TAP-Synchron-Endpunkt.
// Aufruf: npm run import:exoplanets
import path from 'node:path';
import { CATALOG, fetchBuf, sha256, writeAtomic, publishManifest, log } from './lib.js';

const TAP = 'https://exoplanetarchive.ipac.caltech.edu/TAP/sync';
const COLUMNS = [
  'pl_name', 'hostname', 'sy_snum', 'sy_pnum', 'discoverymethod', 'disc_year', 'disc_facility',
  'pl_orbper', 'pl_orbsmax', 'pl_rade', 'pl_bmasse', 'pl_bmassprov', 'pl_orbeccen', 'pl_eqt',
  'st_spectype', 'st_teff', 'st_mass', 'st_rad', 'sy_dist', 'ra', 'dec', 'rastr', 'decstr', 'sy_vmag',
  'pl_pubdate',
];
export const UNITS = {
  pl_orbper: 'Tage', pl_orbsmax: 'AE', pl_rade: 'Erdradien', pl_bmasse: 'Erdmassen', pl_eqt: 'K',
  st_teff: 'K', st_mass: 'Sonnenmassen', st_rad: 'Sonnenradien', sy_dist: 'pc', ra: 'Grad', dec: 'Grad', sy_vmag: 'mag',
};
const NUMERIC = new Set(['sy_snum', 'sy_pnum', 'disc_year', 'pl_orbper', 'pl_orbsmax', 'pl_rade', 'pl_bmasse', 'pl_orbeccen', 'pl_eqt', 'st_teff', 'st_mass', 'st_rad', 'sy_dist', 'ra', 'dec', 'sy_vmag']);

// Minimaler CSV-Parser (RFC 4180: Anführungszeichen, verdoppelte Anführungszeichen, Kommas in Feldern).
export function parseCsv(text) {
  const rows = []; let row = []; let field = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

async function main() {
  const query = `select ${COLUMNS.join(',')} from pscomppars order by pl_name`;
  const url = `${TAP}?query=${encodeURIComponent(query)}&format=csv`;
  const fetchedAt = new Date().toISOString();
  log('Abruf', url);
  const { buf } = await fetchBuf(url, { timeoutMs: 120000 });
  const raw = buf.toString('utf8');
  const rows = parseCsv(raw).filter((r) => r.length > 1);
  const header = rows.shift();
  if (header.join(',') !== COLUMNS.join(',')) throw new Error('Unerwartete Spalten: ' + header.join(','));
  const rawSha = sha256(buf);
  const dir = path.join(CATALOG, 'exoplanets');
  const rawFile = `raw/pscomppars-${fetchedAt.slice(0, 10)}-${rawSha.slice(0, 12)}.csv`;
  writeAtomic(path.join(dir, rawFile), buf);

  const items = []; const rejected = []; const seen = new Set();
  for (const r of rows) {
    const rec = {};
    header.forEach((h, i) => {
      const v = r[i];
      rec[h] = v === '' || v === undefined ? null : NUMERIC.has(h) ? Number(v) : v;
    });
    if (!rec.pl_name) { rejected.push({ reason: 'leerer pl_name', row: r }); continue; }
    if (seen.has(rec.pl_name)) { rejected.push({ id: rec.pl_name, reason: 'doppelter Planet' }); continue; }
    for (const k of NUMERIC) if (rec[k] !== null && !Number.isFinite(rec[k])) rec[k] = null;
    seen.add(rec.pl_name);
    items.push({ id: rec.pl_name, record: rec });
  }
  if (items.length < 100) throw new Error('Zu wenige Einträge: ' + items.length);
  const m = publishManifest('exoplanets', {
    catalog: 'exoplanets', schema: 1, generated_at: fetchedAt,
    source: {
      name: 'NASA Exoplanet Archive – Planetary Systems Composite Parameters (pscomppars)',
      endpoint: TAP, query, retrieved_at: fetchedAt, raw_file: rawFile, raw_sha256: rawSha,
      rights: 'Daten der NASA Exoplanet Archive; Nutzung mit Danksagung gemäss https://exoplanetarchive.ipac.caltech.edu/docs/acknowledge.html',
      citation: 'This research has made use of the NASA Exoplanet Archive, which is operated by the California Institute of Technology, under contract with the National Aeronautics and Space Administration under the Exoplanet Exploration Program.',
      object_url_template: 'https://exoplanetarchive.ipac.caltech.edu/overview/{pl_name}',
    },
    units: UNITS,
    selection_rule: 'Gleichverteilt über alle Einträge (eine Zeile je Planet), sortiert nach pl_name (UTF-16-Codeeinheiten).',
    items, rejected,
  });
  log(`Exoplaneten: ${m.item_count} aktiv, ${rejected.length} verworfen, Version ${m.version.slice(0, 12)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
