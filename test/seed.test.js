import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalize, sha256Hex } from '../public/core/canonical.js';
import { normalizeName, normalizeCoords, computeS0, computeS1, uniformIndex } from '../public/core/seed.js';

test('kanonische Serialisierung sortiert Schlüssel und verbietet undefined', () => {
  assert.equal(canonicalize({ b: 1, a: [true, null, 'x'], c: { z: 0, y: -0 } }), '{"a":[true,null,"x"],"b":1,"c":{"y":0,"z":0}}');
  assert.throws(() => canonicalize({ a: undefined }));
  assert.throws(() => canonicalize({ a: NaN }));
});
test('Namensnormalisierung: NFC, Leerraum, leer', () => {
  assert.equal(normalizeName('  Ada \t  Lovelace\n'), 'Ada Lovelace');
  assert.equal(normalizeName('Amélie'), 'Amélie');
  assert.throws(() => normalizeName('   '));
});
test('Koordinaten: sechs Nachkommastellen, Länge gefaltet', () => {
  const c = normalizeCoords(47.37689999, 188.5);
  assert.equal(c.lat6, '47.376900'); assert.equal(c.lon6, '-171.500000');
  assert.throws(() => normalizeCoords(91, 0));
});
test('S0 ist deterministisch und hängt von Name, Ort und Zeit ab', async () => {
  const base = { normalizedName: 'Ada', lat6: '47.376900', lon6: '8.541700', queryTimeUtc: '2026-11-06T07:00:00.000Z' };
  const a = await computeS0(base); const b = await computeS0(base);
  assert.equal(a.hex, b.hex);
  assert.equal(a.hex, await sha256Hex(a.canonical));
  assert.notEqual((await computeS0({ ...base, normalizedName: 'ada' })).hex, a.hex);
  assert.notEqual((await computeS0({ ...base, queryTimeUtc: '2026-11-06T07:00:00.001Z' })).hex, a.hex);
  await assert.rejects(computeS0({ ...base, queryTimeUtc: '2026-11-06T07:00:00Z' }));
});
test('S1 ändert sich, wenn Wetter oder Astronomie sich ändern', async () => {
  const s0 = 'ab'.repeat(32);
  const w = { values: { temperature_2m: 5.9 } }; const a = { id: 'Kepler-1 b' };
  const s1 = (await computeS1({ s0, weatherForSeed: w, astroForSeed: a })).hex;
  assert.notEqual((await computeS1({ s0, weatherForSeed: { values: { temperature_2m: 6.0 } }, astroForSeed: a })).hex, s1);
  assert.notEqual((await computeS1({ s0, weatherForSeed: w, astroForSeed: { id: 'Kepler-2 b' } })).hex, s1);
  assert.equal((await computeS1({ s0, weatherForSeed: w, astroForSeed: a })).hex, s1);
});
test('uniformIndex: gültiger Bereich, deterministisch, getrennte Ströme, annähernd gleichverteilt', async () => {
  const seed = 'cd'.repeat(32);
  const a = await uniformIndex(seed, 'image', 60); const b = await uniformIndex(seed, 'image', 60);
  assert.deepEqual(a, b); assert.ok(a.index >= 0 && a.index < 60);
  assert.notEqual((await uniformIndex(seed, 'text-work', 60)).index, undefined);
  const counts = new Array(7).fill(0); const N = 7000;
  for (let i = 0; i < N; i++) counts[(await uniformIndex(await sha256Hex('s' + i), 'x', 7)).index]++;
  for (const c of counts) assert.ok(Math.abs(c - N / 7) < 120, 'Verteilung: ' + counts.join(','));
  await assert.rejects(uniformIndex(seed, 'x', 0));
});
