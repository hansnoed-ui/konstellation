import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runConstellation, verifyRecord } from '../public/core/pipeline.js';
import { fakeDeps, okWeather, catalogDir, cleanup } from './helpers.js';

after(cleanup);
const input = { name: 'Ada Lovelace', lat: 47.3769, lon: 8.5417, place_label: 'Zürich' };

test('Konstellation enthält Wetter, Astronomie, ladbares Bild und echte Textstelle', async () => {
  const r = await runConstellation(input, fakeDeps({ weatherLive: async () => okWeather() }));
  assert.equal(r.science.weather.level, 'live');
  assert.equal(r.science.weather.values.precipitation.value, null, 'fehlender Wert bleibt null');
  assert.ok(r.science.astro.id && r.science.astro.record.hostname);
  const img = fs.readFileSync(path.join(catalogDir, 'images', r.culture.image.file));
  assert.ok(img.length > 1000); assert.ok(r.culture.image.rights.includes('CC0'));
  assert.ok(r.culture.text.passage.words >= 40 && r.culture.text.passage.text.length > 100);
  assert.ok(r.culture.text.work.author && r.culture.text.work.title);
  assert.equal(r.time.query_time_utc, '2026-11-06T07:00:00.000Z');
  assert.ok((await verifyRecord(r, fakeDeps())).ok);
});

test('Zeitpunkt wird einmal erfasst; langsame Abfragen ändern ihn nicht', async () => {
  let calls = 0;
  const now = () => new Date(Date.UTC(2026, 10, 6, 7, 0, 0, calls++ * 1000));
  const r = await runConstellation(input, fakeDeps({ now, weatherLive: async () => { await new Promise((res) => setTimeout(res, 50)); return okWeather(); } }));
  assert.equal(r.time.query_time_utc, '2026-11-06T07:00:00.000Z');
  assert.equal(calls, 1);
});

test('Wetter- und Astronomieänderungen gehen in S1 ein; gleiche Daten reproduzieren dieselbe Auswahl', async () => {
  const a = await runConstellation(input, fakeDeps({ weatherLive: async () => okWeather() }));
  const b = await runConstellation(input, fakeDeps({ weatherLive: async () => okWeather() }));
  const c = await runConstellation(input, fakeDeps({ weatherLive: async () => okWeather({ values: { ...okWeather().values, temperature_2m: { value: 6.0, unit: '°C' } } }) }));
  assert.equal(a.seeds.S0.hex, b.seeds.S0.hex); assert.equal(a.seeds.S1.hex, b.seeds.S1.hex);
  assert.equal(a.culture.image.id, b.culture.image.id); assert.equal(a.culture.text.passage.n, b.culture.text.passage.n);
  assert.equal(a.seeds.S0.hex, c.seeds.S0.hex); assert.notEqual(a.seeds.S1.hex, c.seeds.S1.hex, 'S1 muss sich bei anderem Wetter ändern');
});

test('Reihenfolge/Geschwindigkeit der Antworten und Abrufzeit beeinflussen S1 nicht', async () => {
  const fast = await runConstellation(input, fakeDeps({ weatherLive: async () => okWeather({ retrieved_at: '2026-11-06T07:00:00.100Z' }) }));
  const slow = await runConstellation(input, fakeDeps({ weatherLive: async () => { await new Promise((r) => setTimeout(r, 80)); return okWeather({ retrieved_at: '2026-11-06T07:00:04.900Z', raw: { response_text: 'anders' } }); } }));
  assert.equal(fast.seeds.S1.hex, slow.seeds.S1.hex);
});

test('Ausfälle: Timeout, 500, 429, unerwartete Antwort → begrenzte Rückfälle, Archiv korrekt gekennzeichnet', async () => {
  let n = 0;
  const r500 = await runConstellation(input, fakeDeps({ weatherLive: async () => { n++; const e = new Error('HTTP 500'); e.status = 500; throw e; } }));
  assert.equal(n, 2, 'höchstens zwei Versuche'); assert.equal(r500.science.weather.level, 'archive');
  assert.ok(r500.science.weather.provided.name); assert.ok(r500.science.weather.distance_km >= 0);
  assert.notEqual(r500.science.weather.data_time_utc, r500.time.query_time_utc);
  n = 0;
  const r429 = await runConstellation(input, fakeDeps({ weatherLive: async () => { n++; const e = new Error('429'); e.status = 429; throw e; } }));
  assert.equal(n, 1, 'nach 429 keine Wiederholung'); assert.equal(r429.science.weather.level, 'archive');
  n = 0;
  const rUnexp = await runConstellation(input, fakeDeps({ weatherLive: async () => { n++; const e = new Error('kein JSON'); e.unexpected = true; throw e; } }));
  assert.equal(n, 1); assert.equal(rUnexp.science.weather.level, 'archive');
  let t = 0;
  const rTimeout = await runConstellation(input, fakeDeps({ monotonic: () => (t += 3000), weatherLive: async () => { const e = new Error('Zeitüberschreitung'); e.timeout = true; throw e; } }));
  assert.equal(rTimeout.science.weather.level, 'archive');
  assert.ok(rTimeout.technical_log.some((l) => l.outcome?.includes('Zeitbudget')));
  // Cache vor Archiv
  const rCache = await runConstellation(input, fakeDeps({ weatherLive: async () => { throw new Error('aus'); }, weatherCacheGet: async () => okWeather({ retrieved_at: '2026-11-06T05:00:00.000Z' }) }));
  assert.equal(rCache.science.weather.level, 'cache');
});

test('Archiv: fehlende Messwerte sind null, keine erfundenen Nullen', async () => {
  const r = await runConstellation({ ...input, lat: 1.3, lon: 103.9 }, fakeDeps());
  const w = r.science.weather;
  assert.equal(w.level, 'archive');
  for (const v of Object.values(w.values)) assert.ok(v.value === null || typeof v.value === 'number');
  assert.ok(w.notes.some((x) => x.includes('nicht das aktuelle Wetter')));
});

test('defektes Bild wird nach dokumentierter Regel ersetzt und protokolliert', async () => {
  const first = await runConstellation(input, fakeDeps({ weatherLive: async () => okWeather() }));
  const badId = first.culture.image.id;
  const r = await runConstellation(input, fakeDeps({ weatherLive: async () => okWeather(), verifyImage: async (it) => (it.id === badId ? 'Prüfsumme stimmt nicht' : null) }));
  assert.notEqual(r.culture.image.id, badId);
  assert.equal(r.seeds.draws.image.length, 2); assert.equal(r.seeds.draws.image[1].label, 'image#ersatz1');
  assert.ok(r.technical_log.some((l) => l.step === 'image.verify' && l.id === badId));
});

test('Name wird nicht an den Wetteradapter weitergegeben', async () => {
  let args;
  await runConstellation(input, fakeDeps({ weatherLive: async (...a) => { args = a; return okWeather(); } }));
  assert.ok(!JSON.stringify(args).includes('Ada'));
});

test('Ein erneut geöffnetes Protokoll lässt sich prüfen; veränderte Bestände werden erkannt', async () => {
  const r = await runConstellation(input, fakeDeps({ weatherLive: async () => okWeather() }));
  const v = await verifyRecord(r, fakeDeps()); assert.ok(v.ok, v.issues.join('; '));
  const tampered = JSON.parse(JSON.stringify(r)); tampered.seeds.S1.hex = '0'.repeat(64);
  assert.ok(!(await verifyRecord(tampered, fakeDeps())).ok);
  const other = fakeDeps({ loadCatalog: async (n) => { const m = await fakeDeps().loadCatalog(n); return n === 'images' ? { ...m, version: 'x' } : m; } });
  assert.ok((await verifyRecord(r, other)).issues[0].includes('Version'));
});
