// Node-seitige Abhängigkeiten für den Ablauf: Bestände von der Festplatte, Wetter-Cache, Prüfsummen.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { makeWeatherLive, fetchWithTimeout } from '../public/core/openmeteo.js';
import { makeOnline } from '../public/core/online-deps.js';

const UA = 'KONSTELLATION/0.2 (https://github.com/hansnoed-ui/konstellation)';
const MAX_IMAGE_BYTES = 20e6;

const sha256 = (b) => createHash('sha256').update(b).digest('hex');

export function sniff(buf) {
  if (buf.length > 24 && buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') return 'image/png';
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8 && buf[buf.length - 2] === 0xff && buf[buf.length - 1] === 0xd9) return 'image/jpeg';
  return null;
}

export function writeAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`;
  fs.writeFileSync(tmp, data); fs.renameSync(tmp, file);
}

export function makeCatalogLoader(catalogDir) {
  const cache = new Map();
  return async function loadCatalog(name) {
    const f = path.join(catalogDir, name, 'manifest.json');
    const st = fs.statSync(f);
    const hit = cache.get(name);
    if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit.m;
    const m = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (!Array.isArray(m.items) || !m.version) throw new Error(`Manifest ${name} ungültig`);
    cache.set(name, { m, mtimeMs: st.mtimeMs, size: st.size });
    return m;
  };
}

// Lädt eine Online-Bilddatei, prüft Format und Vollständigkeit, legt sie mit Prüfsumme unter data/runtime/online-images ab.
export function makeImageFetcher(dir) {
  return async function fetchImage(url, id, timeoutMs) {
    const res = await fetchWithTimeout(globalThis.fetch, url, timeoutMs, { 'User-Agent': UA });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const len = Number(res.headers.get('content-length')); if (len > MAX_IMAGE_BYTES) throw new Error(`zu gross (${len} Bytes)`);
    const buf = Buffer.from(await res.arrayBuffer()); if (buf.length > MAX_IMAGE_BYTES) throw new Error('zu gross');
    const mime = sniff(buf); if (!mime) throw new Error('kein vollständiges JPEG/PNG');
    const hash = sha256(buf); const file = `${id}.${hash.slice(0, 12)}.${mime === 'image/png' ? 'png' : 'jpg'}`;
    writeAtomic(path.join(dir, file), buf);
    return { file, url: `runtime/online-images/${file}`, sha256: hash, bytes: buf.length, mime, width: null, height: null };
  };
}

export function makeNodeDeps(cfg, overrides = {}) {
  const catalogDir = path.resolve(cfg.root, cfg.catalogDir);
  const runtimeDir = path.resolve(cfg.root, cfg.runtimeDir);
  const online = cfg.online?.enabled === false ? null : makeOnline(cfg.online, {
    headers: { 'User-Agent': UA, 'AIC-User-Agent': UA },
    fetchImage: makeImageFetcher(path.join(runtimeDir, 'online-images')),
    loadIndex: async () => JSON.parse(fs.readFileSync(path.join(catalogDir, 'online', 'gutenberg-index.json'), 'utf8')),
    ...(cfg.online?.providerOptions || {}),
  });
  const cacheFile = path.join(runtimeDir, 'weather-cache.json');
  const key = (lat, lon) => `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const readCache = () => { try { return JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch { return {}; } };
  return {
    mode: 'lokal (Node-Server)',
    timeSource: 'Systemuhr des lokalen Servers (Date) beim Empfang von «Konstellation erzeugen»',
    now: () => new Date(),
    monotonic: () => performance.now(),
    loadCatalog: makeCatalogLoader(catalogDir),
    online,
    weatherLive: cfg.weather?.live === false ? null : makeWeatherLive({ base: cfg.weather?.forecastUrl, headers: { 'User-Agent': 'Konstellation/0.1 (lokal)' } }),
    async weatherCachePut(lat, lon, r) {
      const c = readCache(); const k = key(lat, lon);
      c[k] = [...(c[k] || []), r].sort((a, b) => (a.data_time_utc < b.data_time_utc ? 1 : -1)).slice(0, 12);
      writeAtomic(cacheFile, JSON.stringify(c));
    },
    async weatherCacheGet(lat, lon, queryIso) {
      const list = readCache()[key(lat, lon)] || []; const q = Date.parse(queryIso);
      const maxAge = (cfg.weather?.cacheMaxAgeHours ?? 3) * 3600e3;
      return list.find((r) => { const t = Date.parse(r.data_time_utc); return t <= q && q - t <= maxAge; }) || null;
    },
    async verifyImage(item) {
      const f = path.join(catalogDir, 'images', item.file);
      let buf; try { buf = fs.readFileSync(f); } catch { return 'Datei fehlt'; }
      if (sha256(buf) !== item.sha256) return 'Prüfsumme stimmt nicht';
      if (sniff(buf) !== item.mime) return 'Dateiformat ungültig oder unvollständig';
      return null;
    },
    async loadPassages(work) {
      const f = path.join(catalogDir, 'texts', work.passages_file);
      const buf = fs.readFileSync(f);
      if (sha256(buf) !== work.passages_sha256) throw new Error('Prüfsumme der Textstellen stimmt nicht');
      const doc = JSON.parse(buf.toString('utf8'));
      if (!doc.passages?.length) throw new Error('keine Textstellen');
      return doc;
    },
    ...overrides,
  };
}
