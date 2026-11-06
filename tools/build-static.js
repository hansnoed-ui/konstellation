// Baut die statische Fassung (Ablauf im Browser) in ein Zielverzeichnis, z. B. für den Webspace:
//   node tools/build-static.js <ziel> [--ornament]
// Kopiert public/ und den für die Anzeige nötigen Teil des Bestands (Manifeste, Bilddateien, Textstellen, Karte, Namen),
// nicht aber Rohdaten und TEI-Quellen. --ornament fügt Kopfzeilen für ornament.cloud ein (noindex, Schriften der Website).
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, ROOT } from '../server/index.js';

const [ziel, ...flags] = process.argv.slice(2);
if (!ziel) { console.error('Ziel fehlt'); process.exit(1); }
const ornament = flags.includes('--ornament');
const cfg = loadConfig(); const C = path.resolve(ROOT, cfg.catalogDir); const Z = path.resolve(ziel);
const copy = (from, to) => { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); };
const copyDir = (from, to, filter = () => true) => { for (const e of fs.readdirSync(from, { withFileTypes: true })) { const f = path.join(from, e.name); const t = path.join(to, e.name); if (e.isDirectory()) copyDir(f, t, filter); else if (filter(path.relative(ROOT, f))) copy(f, t); } };

fs.rmSync(Z, { recursive: true, force: true });
copyDir(path.join(ROOT, 'public'), Z);
const K = path.join(Z, 'catalog');
for (const b of ['exoplanets', 'images', 'texts', 'weather-archive']) {
  copy(path.join(C, b, 'manifest.json'), path.join(K, b, 'manifest.json'));
  const m = JSON.parse(fs.readFileSync(path.join(C, b, 'manifest.json'), 'utf8'));
  copy(path.join(C, b, 'manifests', m.version + '.json'), path.join(K, b, 'manifests', m.version + '.json'));
}
copyDir(path.join(C, 'images', 'files'), path.join(K, 'images', 'files'));
for (const w of JSON.parse(fs.readFileSync(path.join(C, 'texts', 'manifest.json'), 'utf8')).items) copy(path.join(C, 'texts', w.passages_file), path.join(K, 'texts', w.passages_file));
copyDir(path.join(C, 'basemap'), path.join(K, 'basemap'));
copyDir(path.join(C, 'names'), path.join(K, 'names'));
const b = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
fs.writeFileSync(path.join(Z, 'VERSION.txt'), `KONSTELLATION ${b.version}, statische Fassung, gebaut ${new Date().toISOString()}\nQuelle: https://github.com/hansnoed-ui/konstellation\n`);

if (ornament) {
  const f = path.join(Z, 'index.html'); let h = fs.readFileSync(f, 'utf8');
  h = h.replace('<html lang="de">', '<html lang="de-CH">');
  h = h.replace('<link rel="stylesheet" href="vendor/leaflet/leaflet.css">', `<meta name="robots" content="noindex">
<link rel="icon" href="../../b/bilder/signet/signet.svg">
<link rel="stylesheet" href="../../vendor/fonts/fonts.css">
<link rel="stylesheet" href="vendor/leaflet/leaflet.css">`);
  h = h.replace('<link rel="stylesheet" href="app.css">', '<link rel="stylesheet" href="app.css">\n<style>:root{--sans:"Instrument Sans",Inter,system-ui,sans-serif;--mono:ui-monospace,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace;--serif:"Newsreader",Georgia,serif}</style>');
  h = h.replace('<header class="kopf">', '<header class="kopf">\n  <p class="unter"><a href="../../">ornament.cloud</a> · Alpha</p>');
  h = h.replace('<p id="modus"></p>', '<p id="modus"></p>\n  <p>Quellcode, Bestand und Dokumentation: <a href="https://github.com/hansnoed-ui/konstellation">github.com/hansnoed-ui/konstellation</a></p>');
  fs.writeFileSync(f, h);
}
const size = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((a, e) => a + (e.isDirectory() ? size(path.join(d, e.name)) : fs.statSync(path.join(d, e.name)).size), 0);
console.log(`gebaut: ${Z} (${(size(Z) / 1e6).toFixed(1)} MB)`);
