// Adapter-Tests gegen einen simulierten Anbieter (echtes HTTP): 429 mit Retry-After, 500, Timeout, kaputte Antwort.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { makeWeatherLive, resetBreaker, breakerState } from '../public/core/openmeteo.js';
import { normalizeOpenMeteoCurrent } from '../public/core/weather.js';

const good = { latitude: 47.38, longitude: 8.54, utc_offset_seconds: 0, elevation: 420, current_units: { time: 'iso8601', interval: 'seconds', temperature_2m: '°C', wind_speed_10m: 'km/h', wind_direction_10m: '°', pressure_msl: 'hPa', cloud_cover: '%', precipitation: 'mm' }, current: { time: '2026-11-06T07:30', interval: 900, temperature_2m: 6, wind_speed_10m: 1.5, wind_direction_10m: 346, pressure_msl: 1023.7, cloud_cover: 100, precipitation: 0 } };
let mode = 'ok';
const srv = http.createServer((req, res) => {
  if (mode === 'ok') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(good)); }
  else if (mode === '429') { res.writeHead(429, { 'Retry-After': '120' }); res.end('{"error":true}'); }
  else if (mode === '500') { res.writeHead(500); res.end('kaputt'); }
  else if (mode === 'html') { res.writeHead(200); res.end('<html>nope</html>'); }
  else if (mode === 'empty') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ...good, current: { time: '2026-11-06T07:30', interval: 900 } })); }
  else if (mode === 'hang') { /* nie antworten */ }
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${srv.address().port}/v1/forecast`;
test.after(() => srv.close());

test('Normalisierung: Einheiten geprüft, Zeit UTC, fehlende Werte null', () => {
  const n = normalizeOpenMeteoCurrent(good);
  assert.equal(n.data_time_utc, '2026-11-06T07:30:00.000Z'); assert.equal(n.values.temperature_2m.value, 6);
  assert.equal(normalizeOpenMeteoCurrent({ ...good, current: { ...good.current, precipitation: undefined } }).values.precipitation.value, null);
  assert.throws(() => normalizeOpenMeteoCurrent({ ...good, current_units: { ...good.current_units, temperature_2m: '°F' } }));
  assert.throws(() => normalizeOpenMeteoCurrent({ ...good, utc_offset_seconds: 3600 }));
});
test('Live-Adapter: Erfolg', async () => { resetBreaker(); mode = 'ok'; const w = await makeWeatherLive({ base })(47.38, 8.54, 2000); assert.equal(w.values.temperature_2m.value, 6); assert.ok(w.retrieved_at); });
test('429: Fehler mit Status, Anbieter wird bis Retry-After übersprungen', async () => {
  resetBreaker(); mode = '429'; let now = 1000000; const live = makeWeatherLive({ base, nowMs: () => now });
  await assert.rejects(live(1, 1, 2000), (e) => e.status === 429);
  assert.ok(breakerState().until >= now + 120000);
  await assert.rejects(live(1, 1, 2000), (e) => e.skipped === true);
  now += 121000; mode = 'ok'; assert.ok(await live(1, 1, 2000));
});
test('500 und HTML: Fehler; nach drei Fehlern 5 Minuten Pause', async () => {
  resetBreaker(); mode = '500'; let now = 0; const live = makeWeatherLive({ base, nowMs: () => now });
  await assert.rejects(live(1, 1, 2000), (e) => e.status === 500);
  mode = 'html'; await assert.rejects(live(1, 1, 2000), (e) => e.unexpected === true);
  mode = 'empty'; await assert.rejects(live(1, 1, 2000), (e) => e.unexpected === true);
  assert.equal(breakerState().fails, 1, 'unerwartete Antworten (200) zählen nicht als Verbindungsfehler');
  mode = '500'; await live(1, 1, 2000).catch(() => {}); await live(1, 1, 2000).catch(() => {});
  assert.ok(breakerState().until > 0);
});
test('Timeout wird eingehalten', async () => {
  resetBreaker(); mode = 'hang'; const t0 = Date.now();
  await assert.rejects(makeWeatherLive({ base })(1, 1, 300), (e) => e.timeout === true);
  assert.ok(Date.now() - t0 < 1500);
});
