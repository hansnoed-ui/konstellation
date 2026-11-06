// Erzeugt eine Konstellation ohne Oberfläche und speichert sie (für Beispiel und Abnahme).
// node tools/example-run.js "Name" lat lon "Ortsname"
import path from 'node:path';
import fs from 'node:fs';
import { runConstellation, verifyRecord } from '../public/core/pipeline.js';
import { buildPackage } from '../public/core/package.js';
import { makeNodeDeps, writeAtomic } from '../server/deps.js';
import { loadConfig, ROOT } from '../server/index.js';
const [name = 'Ada', lat = '47.3769', lon = '8.5417', label = 'Zürich'] = process.argv.slice(2);
const cfg = loadConfig(); const deps = makeNodeDeps(cfg);
const r = await runConstellation({ name, lat: Number(lat), lon: Number(lon), place_label: label, place_label_source: 'Kommandozeile' }, deps);
const dir = path.join(ROOT, cfg.runtimeDir, 'constellations');
writeAtomic(path.join(dir, r.id + '.json'), JSON.stringify(r, null, 2));
const zip = buildPackage(r, fs.readFileSync(path.join(ROOT, cfg.catalogDir, 'images', r.culture.image.file)));
writeAtomic(path.join(ROOT, cfg.runtimeDir, 'exports', `konstellation-${r.id}.zip`), zip);
console.log(JSON.stringify({ id: r.id, S0: r.seeds.S0.hex, S1: r.seeds.S1.hex, weather: [r.science.weather.level, r.science.weather.data_time_utc, r.science.weather.values.temperature_2m], astro: r.science.astro.id, image: [r.culture.image.id, r.culture.image.title], text: [r.culture.text.work.author, r.culture.text.work.title, r.culture.text.passage.n], verify: await verifyRecord(r, deps) }, null, 1));
