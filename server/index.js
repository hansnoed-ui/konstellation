// Lokaler Server: liefert Oberfläche und Bestände aus, führt Konstellationen aus, speichert sie auf der Festplatte.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runConstellation, verifyRecord } from '../public/core/pipeline.js';
import { geocodeOpenMeteo, searchLocalPlaces } from '../public/core/openmeteo.js';
import { buildPackage } from '../public/core/package.js';
import { makeNodeDeps, writeAtomic } from './deps.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.geojson': 'application/geo+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json' };

export function loadConfig(overrides = {}) {
  const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'default.json'), 'utf8'));
  let local = {}; try { local = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'local.json'), 'utf8')); } catch {}
  const cfg = { ...base, ...local, ...overrides, root: ROOT };
  if (process.env.KONSTELLATION_OFFLINE === '1') { cfg.weather = { ...cfg.weather, live: false }; cfg.geocoding = { ...cfg.geocoding, online: false }; cfg.map = { ...cfg.map, tilesEnabled: false }; cfg.online = { ...cfg.online, enabled: false }; }
  if (process.env.PORT) cfg.port = Number(process.env.PORT);
  return cfg;
}

export function createServer(cfg, depsOverrides = {}) {
  const deps = makeNodeDeps(cfg, depsOverrides);
  const recDir = path.join(path.resolve(ROOT, cfg.runtimeDir), 'constellations');
  const catalogDir = path.resolve(ROOT, cfg.catalogDir);
  const runtimeDir = path.resolve(ROOT, cfg.runtimeDir);
  const places = JSON.parse(fs.readFileSync(path.join(catalogDir, 'basemap', 'places.json'), 'utf8'));
  const send = (res, code, body, type = 'application/json; charset=utf-8', extra = {}) => {
    res.writeHead(code, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', ...extra });
    res.end(typeof body === 'string' || Buffer.isBuffer(body) || body instanceof Uint8Array ? body : JSON.stringify(body));
  };
  const readRecord = (id) => { if (!/^[0-9A-Za-z-]{8,40}$/.test(id)) return null; try { return JSON.parse(fs.readFileSync(path.join(recDir, id + '.json'), 'utf8')); } catch { return null; } };
  const serveFile = (res, base, rel) => {
    const f = path.resolve(base, '.' + path.posix.normalize('/' + rel));
    if (!f.startsWith(base + path.sep) && f !== base) return send(res, 403, { error: 'verboten' });
    fs.stat(f, (err, st) => {
      if (err || !st.isFile()) return send(res, 404, { error: 'nicht gefunden' });
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Content-Length': st.size, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': rel.includes('/files/') || rel.includes('/works/') ? 'public, max-age=31536000, immutable' : 'no-cache' });
      fs.createReadStream(f).pipe(res);
    });
  };
  let busy = false;
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const p = decodeURIComponent(url.pathname);
    try {
      if (p === '/api/config') return send(res, 200, { mode: 'server', map: cfg.map, geocodingOnline: cfg.geocoding.online, weatherLive: cfg.weather.live !== false, online: cfg.online?.enabled !== false ? { images: cfg.online?.images ?? ['met', 'aic'], texts: cfg.online?.texts ?? ['gutenberg'], textLanguages: cfg.online?.textLanguages ?? ['de'] } : null });
      if (p === '/api/geocode') {
        const q = (url.searchParams.get('q') || '').slice(0, 100);
        let results = []; let source = 'lokal'; let note = null;
        if (cfg.geocoding.online) { try { results = await geocodeOpenMeteo(q, { timeoutMs: cfg.geocoding.timeoutMs }); source = 'Open-Meteo'; } catch (e) { note = 'Online-Ortssuche nicht erreichbar: ' + e.message; } }
        if (!results.length) { results = searchLocalPlaces(places, q); source = 'lokal'; }
        return send(res, 200, { source, note, results });
      }
      if (p === '/api/constellations' && req.method === 'POST') {
        if (busy) return send(res, 429, { error: 'Es läuft bereits eine Konstellation.' });
        let body = ''; for await (const ch of req) { body += ch; if (body.length > 4096) return send(res, 413, { error: 'zu gross' }); }
        let input; try { input = JSON.parse(body); } catch { return send(res, 400, { error: 'ungültiges JSON' }); }
        busy = true;
        try {
          const record = await runConstellation({ name: input.name, lat: input.lat, lon: input.lon, place_label: input.place_label, place_label_source: input.place_label_source, online_first: input.online_first !== false, text_languages: Array.isArray(input.text_languages) ? input.text_languages.slice(0, 5) : undefined }, deps);
          writeAtomic(path.join(recDir, record.id + '.json'), JSON.stringify(record, null, 2));
          return send(res, 201, record);
        } catch (e) { return send(res, 400, { error: e.message }); } finally { busy = false; }
      }
      if (p === '/api/constellations' && req.method === 'GET') {
        let files = []; try { files = fs.readdirSync(recDir).filter((f) => f.endsWith('.json')); } catch {}
        const list = files.map((f) => { try { const r = JSON.parse(fs.readFileSync(path.join(recDir, f), 'utf8')); return { id: r.id, name: r.input.display_name, place: r.input.place_label, lat: r.input.lat6, lon: r.input.lon6, time: r.time.query_time_utc }; } catch { return null; } }).filter(Boolean);
        return send(res, 200, list.sort((a, b) => (a.time < b.time ? 1 : -1)));
      }
      let m;
      if ((m = p.match(/^\/api\/constellations\/([^/]+)(\/export\.(json|zip)|\/verify)?$/))) {
        const r = readRecord(m[1]); if (!r) return send(res, 404, { error: 'unbekannt' });
        if (!m[2]) return send(res, 200, r);
        if (m[2] === '/verify') return send(res, 200, await verifyRecord(r, deps));
        if (m[3] === 'json') return send(res, 200, JSON.stringify(r, null, 2), 'application/json; charset=utf-8', { 'Content-Disposition': `attachment; filename="konstellation-${r.id}.json"` });
        const im = r.culture.image; let img = null;
        try { img = fs.readFileSync(im.source_mode === 'online' ? path.join(runtimeDir, 'online-images', path.basename(im.file)) : path.join(catalogDir, 'images', im.file)); } catch { img = null; }
        return send(res, 200, Buffer.from(buildPackage(r, img)), 'application/zip', { 'Content-Disposition': `attachment; filename="konstellation-${r.id}.zip"` });
      }
      if (p.startsWith('/catalog/')) return serveFile(res, catalogDir, p.slice('/catalog'.length));
      if (p.startsWith('/runtime/online-images/')) return serveFile(res, path.join(runtimeDir, 'online-images'), p.slice('/runtime/online-images'.length));
      if (p.startsWith('/api/')) return send(res, 404, { error: 'unbekannt' });
      return serveFile(res, path.join(ROOT, 'public'), p === '/' ? '/index.html' : p);
    } catch (e) { return send(res, 500, { error: 'interner Fehler: ' + e.message }); }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cfg = loadConfig();
  createServer(cfg).listen(cfg.port, cfg.host, () => console.log(`KONSTELLATION läuft auf http://${cfg.host}:${cfg.port}${cfg.weather.live === false ? ' (offline)' : ''}`));
}
