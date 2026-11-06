// Gemeinsamer Ablauf für Bildimporte: Download in den Staging-Bereich, Format- und
// Vollständigkeitsprüfung, erst danach Übernahme in den aktiven Bestand (atomar per Manifest).
import fs from 'node:fs';
import path from 'node:path';
import { CATALOG, STAGING, fetchBuf, sha256, sniffImage, jpegComplete, writeAtomic, readJson, publishManifest, log } from './lib.js';

export const IMG_DIR = path.join(CATALOG, 'images');
export const MIN_EDGE = 300;

export function loadImageManifest() {
  return readJson(path.join(IMG_DIR, 'manifest.json'), {
    catalog: 'images', schema: 1, items: [], rejected: [],
    selection_rule: 'Gleichverteilt über alle Einträge des aktiven Manifests, sortiert nach id (UTF-16-Codeeinheiten).',
  });
}

// Lädt und prüft ein Bild; gibt einen Manifesteintrag zurück oder wirft mit Begründung.
export async function acquireImage({ id, url, provider, meta, rawMeta, extraHeaders }) {
  const stagingFile = path.join(STAGING, 'images', id.replace(/[^A-Za-z0-9._-]/g, '_'));
  const { buf, headers } = await fetchBuf(url, { timeoutMs: 60000, headers: extraHeaders });
  fs.mkdirSync(path.dirname(stagingFile), { recursive: true });
  fs.writeFileSync(stagingFile, buf);
  const info = sniffImage(buf);
  if (!info) throw new Error('kein JPEG/PNG (Magic Bytes)');
  if (info.type === 'image/jpeg' && !jpegComplete(buf)) throw new Error('JPEG unvollständig (kein EOI)');
  if (Math.min(info.width, info.height) < MIN_EDGE) throw new Error(`zu klein (${info.width}×${info.height})`);
  const hash = sha256(buf);
  const rel = `files/${id.replace(/[^A-Za-z0-9._-]/g, '_')}.${hash.slice(0, 12)}.${info.ext}`;
  writeAtomic(path.join(IMG_DIR, rel), buf);
  const metaRel = `meta/${id.replace(/[^A-Za-z0-9._-]/g, '_')}.json`;
  writeAtomic(path.join(IMG_DIR, metaRel), JSON.stringify(rawMeta, null, 1));
  fs.rmSync(stagingFile, { force: true });
  return {
    id, provider, ...meta,
    file: rel, sha256: hash, bytes: buf.length, mime: info.type, width: info.width, height: info.height,
    image_url: url, content_type_header: headers['content-type'] || null,
    raw_metadata_file: metaRel, raw_metadata_sha256: sha256(Buffer.from(JSON.stringify(rawMeta, null, 1))),
  };
}

export function finish(manifest, added, rejected) {
  const byId = new Map(manifest.items.map((x) => [x.id, x]));
  for (const a of added) byId.set(a.id, a);
  manifest.items = [...byId.values()];
  manifest.rejected = [...(manifest.rejected || []), ...rejected].slice(-500);
  manifest.generated_at = new Date().toISOString();
  const m = publishManifest('images', manifest);
  log(`Bilder: ${added.length} neu, ${rejected.length} verworfen, aktiv ${m.item_count}, Version ${m.version.slice(0, 12)}`);
  return m;
}
