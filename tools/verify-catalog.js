// Prüft den aktiven Bestand: Manifestversionen, Dateien, Prüfsummen, Bildformate, Textstellen, Mindestzahlen.
// npm run verify   (Exit 1 bei Fehlern)
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { canonicalize } from '../public/core/canonical.js';
import { sniff } from '../server/deps.js';
import { loadConfig, ROOT } from '../server/index.js';

const cfg = loadConfig(); const C = path.resolve(ROOT, cfg.catalogDir);
const sha = (b) => createHash('sha256').update(b).digest('hex');
const problems = []; const summary = {};
function manifest(name) {
  const m = JSON.parse(fs.readFileSync(path.join(C, name, 'manifest.json'), 'utf8'));
  const v = sha(Buffer.from(canonicalize(m.items)));
  if (v !== m.version) problems.push(`${name}: Manifestversion ${m.version.slice(0, 12)} ≠ berechnet ${v.slice(0, 12)}`);
  const ids = m.items.map((x) => x.id); if (new Set(ids).size !== ids.length) problems.push(`${name}: doppelte ids`);
  if (ids.some((id, i) => i && !(ids[i - 1] < id))) problems.push(`${name}: items nicht sortiert`);
  if (!fs.existsSync(path.join(C, name, 'manifests', m.version + '.json'))) problems.push(`${name}: versioniertes Manifest fehlt`);
  return m;
}
const ex = manifest('exoplanets'); summary.exoplanets = ex.items.length;
if (ex.items.length < 100) problems.push('weniger als 100 Exoplaneten');
for (const it of ex.items) if (!it.record?.pl_name || it.record.pl_name !== it.id) problems.push('Exoplanet ohne/abweichenden Namen: ' + it.id);
const im = manifest('images'); summary.images = im.items.length; summary.image_providers = {};
if (im.items.length < 30) problems.push('weniger als 30 Bilder');
for (const it of im.items) {
  summary.image_providers[it.provider] = (summary.image_providers[it.provider] || 0) + 1;
  const f = path.join(C, 'images', it.file); let b; try { b = fs.readFileSync(f); } catch { problems.push('Bilddatei fehlt: ' + it.id); continue; }
  if (sha(b) !== it.sha256) problems.push('Prüfsumme Bild: ' + it.id);
  if (sniff(b) !== it.mime) problems.push('Bildformat: ' + it.id);
  if (!it.rights || !it.source_url || !it.title) problems.push('Bild ohne Rechte/Quelle/Titel: ' + it.id);
  if (!fs.existsSync(path.join(C, 'images', it.raw_metadata_file))) problems.push('Rohmetadaten fehlen: ' + it.id);
}
const tx = manifest('texts'); summary.texts = tx.items.length; summary.authors = new Set(tx.items.map((x) => x.author)).size; summary.passages = 0;
if (tx.items.length < 20) problems.push('weniger als 20 Texte');
if (summary.authors < 5) problems.push('zu wenige Autor:innen');
for (const it of tx.items) {
  const f = path.join(C, 'texts', it.passages_file); let b; try { b = fs.readFileSync(f); } catch { problems.push('Textstellen fehlen: ' + it.id); continue; }
  if (sha(b) !== it.passages_sha256) problems.push('Prüfsumme Textstellen: ' + it.id);
  const d = JSON.parse(b); summary.passages += d.passages.length;
  if (d.passages.length !== it.passage_count) problems.push('Stellenzahl weicht ab: ' + it.id);
  if (d.passages.some((p) => !p.text || p.words < 40)) problems.push('ungültige Stelle in ' + it.id);
  if (!fs.existsSync(path.join(C, 'texts', it.tei_file))) problems.push('TEI-Datei fehlt: ' + it.id);
  if (!it.rights || !it.attribution) problems.push('Text ohne Rechte/Namensnennung: ' + it.id);
}
const wa = manifest('weather-archive'); summary.weather_locations = wa.items.length; summary.weather_records = wa.items.reduce((a, l) => a + l.records.length, 0);
if (wa.items.length < 5) problems.push('zu wenige Wetterarchiv-Orte');
for (const l of wa.items) for (const r of l.records) { if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(r.data_time_utc)) problems.push('Wetterdatensatz ohne UTC-Zeit: ' + r.id); for (const v of Object.values(r.values)) if (!(v.value === null || typeof v.value === 'number')) problems.push('Wetterwert ungültig: ' + r.id); }
for (const f of ['basemap/countries-110m.geojson', 'basemap/places.json', 'names/names.json']) if (!fs.existsSync(path.join(C, f))) problems.push('fehlt: ' + f);
const bm = JSON.parse(fs.readFileSync(path.join(C, 'basemap/manifest.json'), 'utf8'));
for (const s of bm.sources) if (sha(fs.readFileSync(path.join(C, 'basemap', s.file))) !== s.sha256) problems.push('Prüfsumme Basiskarte: ' + s.file);
console.log(JSON.stringify({ summary, versions: { exoplanets: ex.version, images: im.version, texts: tx.version, weather_archive: wa.version }, problems }, null, 1));
process.exit(problems.length ? 1 : 0);
