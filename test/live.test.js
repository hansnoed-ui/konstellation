// Optionaler Live-Test gegen Open-Meteo (nur mit KONSTELLATION_LIVE_TEST=1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWeatherLive, geocodeOpenMeteo, resetBreaker } from '../public/core/openmeteo.js';
test('Open-Meteo live: Wetter und Ortssuche', { skip: process.env.KONSTELLATION_LIVE_TEST !== '1' }, async () => {
  resetBreaker();
  const w = await makeWeatherLive({})(47.3769, 8.5417, 5000);
  assert.ok(typeof w.values.temperature_2m.value === 'number'); assert.ok(w.data_time_utc.endsWith('Z'));
  const sea = await makeWeatherLive({})(0, -30, 5000); assert.ok(sea.provided.lat !== null);
  const g = await geocodeOpenMeteo('Bern'); assert.ok(g.length > 1 && g.some((x) => x.country === 'Schweiz'));
});
