// Browser-Abhängigkeiten für die statische Fassung (z. B. ornament.cloud): Bestände per fetch,
// Wetter direkt bei Open-Meteo, Speicherung im Browser (localStorage).
import { makeWeatherLive } from './core/openmeteo.js';
import { sha256Hex } from './core/canonical.js';
import { makeOnline } from './core/online-deps.js';

const LS = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } } };
export { LS };

function sniff(b) {
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8 && b[b.length - 2] === 0xff && b[b.length - 1] === 0xd9) return 'image/jpeg';
  return null;
}

export function makeBrowserDeps({ base = 'catalog/', weatherLive = true, online = true, textProxy = null } = {}) {
  const catalogs = new Map();
  // Online-Ziehung im Browser: Met und AIC erlauben CORS direkt; Project Gutenberg nicht – dafür ein optionaler Textproxy
  // (textProxy, z. B. «proxy.php?u=» auf dem Webspace). Ohne Proxy fällt der Text auf den Bestand zurück.
  // Bilddateien werden im Browser nicht heruntergeladen und geprüft (verified_locally=false), die Anzeige lädt sie vom Anbieter.
  // Schlüssel (z. B. Europeana) kommen aus einer optionalen Datei keys.js auf dem Webspace: window.KONSTELLATION_KEYS = { europeana: '…' } – nicht im Repository.
  const onlineDeps = online ? makeOnline({ texts: textProxy ? ['gutenberg'] : [], keys: globalThis.KONSTELLATION_KEYS || {} }, {
    loadIndex: async () => { const r = await fetch(`${base}online/gutenberg-index.json`, { cache: 'no-cache' }); if (!r.ok) throw new Error(`Gutenberg-Index: HTTP ${r.status}`); return r.json(); },
    rewrite: textProxy ? (u) => textProxy + encodeURIComponent(u) : undefined,
  }) : null;
  const key = (lat, lon) => `${lat.toFixed(2)},${lon.toFixed(2)}`;
  return {
    mode: 'statisch (Browser)',
    online: onlineDeps,
    timeSource: 'Gerätezeit des Browsers (Date) beim Klick auf «Konstellation erzeugen»',
    now: () => new Date(),
    monotonic: () => performance.now(),
    async loadCatalog(name) {
      if (!catalogs.has(name)) catalogs.set(name, fetch(`${base}${name}/manifest.json`, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(`Bestand ${name}: HTTP ${r.status}`); return r.json(); }));
      return catalogs.get(name);
    },
    weatherLive: weatherLive ? makeWeatherLive({}) : null,
    async weatherCachePut(lat, lon, r) {
      const c = LS.get('konstellation.wettercache', {}); const k = key(lat, lon);
      c[k] = [...(c[k] || []), r].sort((a, b) => (a.data_time_utc < b.data_time_utc ? 1 : -1)).slice(0, 6);
      LS.set('konstellation.wettercache', c);
    },
    async weatherCacheGet(lat, lon, queryIso) {
      const list = LS.get('konstellation.wettercache', {})[key(lat, lon)] || []; const q = Date.parse(queryIso);
      return list.find((r) => { const t = Date.parse(r.data_time_utc); return t <= q && q - t <= 3 * 3600e3; }) || null;
    },
    async verifyImage(item) {
      let buf; try { const r = await fetch(`${base}images/${item.file}`); if (!r.ok) return `Datei fehlt (HTTP ${r.status})`; buf = new Uint8Array(await r.arrayBuffer()); } catch { return 'Datei nicht ladbar'; }
      if (await sha256Hex(buf) !== item.sha256) return 'Prüfsumme stimmt nicht';
      if (sniff(buf) !== item.mime) return 'Dateiformat ungültig oder unvollständig';
      return null;
    },
    async loadPassages(work) {
      const r = await fetch(`${base}texts/${work.passages_file}`); if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = new Uint8Array(await r.arrayBuffer());
      if (await sha256Hex(buf) !== work.passages_sha256) throw new Error('Prüfsumme der Textstellen stimmt nicht');
      return JSON.parse(new TextDecoder().decode(buf));
    },
  };
}
