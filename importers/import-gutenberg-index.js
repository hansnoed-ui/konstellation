// Katalogindex für den Online-Anbieter Project Gutenberg: lädt pg_catalog.csv.gz (offizielle Gesamtliste), speichert
// je gewünschter Sprache die IDs aller Einträge vom Typ «Text» sowie die höchste ID (für den ID-Raum «alle Sprachen»).
//   node importers/import-gutenberg-index.js [Sprachen, kommagetrennt; Standard de]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fetchBuf, sha256, writeAtomic, log } from './lib.js';
import { parseCsv } from './import-exoplanets.js';
import { loadConfig, ROOT } from '../server/index.js';

const langs = (process.argv[2] || 'de').split(',').map((s) => s.trim()).filter(Boolean);
const cfg = loadConfig(); const dir = path.join(path.resolve(ROOT, cfg.catalogDir), 'online');
const url = 'https://www.gutenberg.org/cache/epub/feeds/pg_catalog.csv.gz';
const { buf: gz } = await fetchBuf(url, { timeoutMs: 120000 });
const csv = zlib.gunzipSync(gz).toString('utf8');
const raw = parseCsv(csv); const head = raw[0]; const rows = raw.slice(1).filter((r) => r.length === head.length).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
const languages = Object.fromEntries(langs.map((l) => [l, []])); const counts = {}; let maxId = 0; let texts = 0;
for (const r of rows) {
  const id = Number(r['Text#']); if (!(id > 0)) continue; maxId = Math.max(maxId, id);
  if (r.Type !== 'Text') continue; texts++;
  for (const l of r.Language.split(';').map((s) => s.trim())) { counts[l] = (counts[l] || 0) + 1; if (languages[l]) languages[l].push(id); }
}
for (const l of langs) languages[l].sort((a, b) => a - b);
const out = { schema: 'konstellation-gutenberg-index/1', source: url, source_sha256: sha256(gz), retrieved_at: new Date().toISOString(), rows: rows.length, texts, max_id: maxId, languages, counts_by_language: counts };
fs.mkdirSync(dir, { recursive: true }); writeAtomic(path.join(dir, 'gutenberg-index.json'), JSON.stringify(out));
log(`Gutenberg-Index: ${rows.length} Zeilen, ${texts} Texte, höchste ID ${maxId}, ${langs.map((l) => `${l}: ${languages[l].length}`).join(', ')}`);
