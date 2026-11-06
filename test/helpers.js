import fs from 'node:fs';
import path from 'node:path';
import { makeNodeDeps } from '../server/deps.js';
import { loadConfig, ROOT } from '../server/index.js';

export const cfg = loadConfig();
export const catalogDir = path.resolve(ROOT, cfg.catalogDir);
export function fakeDeps(over = {}) {
  let t = 0;
  return makeNodeDeps({ ...cfg, runtimeDir: 'data/runtime/test-' + process.pid }, {
    now: over.now || (() => new Date('2026-11-06T07:00:00.000Z')),
    monotonic: over.monotonic || (() => (t += 1)),
    weatherLive: over.weatherLive === undefined ? null : over.weatherLive,
    weatherCacheGet: over.weatherCacheGet === undefined ? null : over.weatherCacheGet,
    weatherCachePut: over.weatherCachePut === undefined ? null : over.weatherCachePut,
    ...over,
  });
}
export const okWeather = (extra = {}) => ({
  provider: 'fake', source: 'open-meteo-forecast', data_kind: 'Test', data_time_utc: '2026-11-06T06:45:00.000Z', retrieved_at: '2026-11-06T07:00:01.000Z',
  provided: { lat: 47.38, lon: 8.54, elevation_m: 420, kind: 'Rasterzelle' },
  values: { temperature_2m: { value: 5.9, unit: '°C' }, wind_speed_10m: { value: 1.5, unit: 'km/h' }, wind_direction_10m: { value: 346, unit: '°' }, pressure_msl: { value: 1023.7, unit: 'hPa' }, cloud_cover: { value: 100, unit: '%' }, precipitation: { value: null, unit: 'mm' } },
  raw: { response_text: '{}' }, notes: [], ...extra,
});
export function cleanup() { fs.rmSync(path.join(ROOT, 'data/runtime/test-' + process.pid), { recursive: true, force: true }); }
