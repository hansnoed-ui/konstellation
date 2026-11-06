// Gemeinsame Hilfen für Importwerkzeuge: Download mit Zeitlimit, Prüfsummen,
// Bildformatprüfung, atomare Manifest-Aktualisierung.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalize } from '../public/core/canonical.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CATALOG = path.join(ROOT, 'data', 'catalog');
export const STAGING = path.join(ROOT, 'data', 'staging');
export const UA = 'Konstellation-Importer/0.1 (lokaler Forschungsprototyp; einzelne, gedrosselte Abrufe)';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function sha256(buf) { return createHash('sha256').update(buf).digest('hex'); }

export async function fetchBuf(url, { timeoutMs = 30000, headers = {}, retries = 2 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers }, signal: ac.signal, redirect: 'follow' });
      if (res.status === 429 || res.status >= 500) {
        const ra = Number(res.headers.get('retry-after'));
        lastErr = new Error(`HTTP ${res.status} für ${url}`);
        lastErr.status = res.status;
        if (attempt < retries) { await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra, 60) * 1000 : 2000 * (attempt + 1)); continue; }
        throw lastErr;
      }
      if (!res.ok) { const e = new Error(`HTTP ${res.status} für ${url}`); e.status = res.status; throw e; }
      const buf = Buffer.from(await res.arrayBuffer());
      return { buf, status: res.status, headers: Object.fromEntries(res.headers), url: res.url };
    } catch (e) {
      lastErr = e;
      if (e.status && e.status < 500 && e.status !== 429) throw e;
      if (attempt < retries) { await sleep(1500 * (attempt + 1)); continue; }
    } finally { clearTimeout(timer); }
  }
  throw lastErr;
}

export async function fetchJson(url, opts) {
  const r = await fetchBuf(url, opts);
  return { ...r, json: JSON.parse(r.buf.toString('utf8')) };
}

// Erkennt JPEG/PNG anhand der Magic Bytes und liest die Pixelmasse.
export function sniffImage(buf) {
  if (buf.length > 24 && buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') {
    return { type: 'image/png', ext: 'png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const len = buf.readUInt16BE(i + 2);
      if ((marker >= 0xc0 && marker <= 0xcf) && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { type: 'image/jpeg', ext: 'jpg', height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
    return null;
  }
  return null;
}

export function jpegComplete(buf) {
  // Eine vollständige JPEG-Datei endet mit EOI (FF D9), ggf. gefolgt von Füllbytes.
  for (let i = buf.length - 1; i > Math.max(0, buf.length - 64); i--) {
    if (buf[i] === 0xd9 && buf[i - 1] === 0xff) return true;
  }
  return false;
}

export function writeAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

export function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

// Schreibt ein Manifest versioniert: Version = SHA-256 der kanonischen, nach id sortierten Einträge.
// Das bisherige aktive Manifest bleibt unter manifests/<version>.json erhalten.
export function publishManifest(catalogName, manifest) {
  const dir = path.join(CATALOG, catalogName);
  manifest.items.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const ids = new Set();
  for (const it of manifest.items) { if (ids.has(it.id)) throw new Error('doppelte id ' + it.id); ids.add(it.id); }
  manifest.version = sha256(Buffer.from(canonicalize(manifest.items)));
  manifest.item_count = manifest.items.length;
  const text = JSON.stringify(manifest, null, 1) + '\n';
  writeAtomic(path.join(dir, 'manifests', `${manifest.version}.json`), text);
  writeAtomic(path.join(dir, 'manifest.json'), text);
  return manifest;
}

export function log(...a) { console.log(new Date().toISOString(), ...a); }
