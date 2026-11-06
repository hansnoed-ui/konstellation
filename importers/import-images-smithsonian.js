// Import: Smithsonian Open Access – Smithsonian American Art Museum (SAAM), nur Gemälde,
// nur Datensätze mit metadata_usage.access = CC0 UND Medium usage.access = CC0.
// Metadaten aus dem öffentlichen Open-Access-Bucket (AWS Open Data), Bilddatei über den IDS-Lieferdienst
// (Parameter max=1200). Stichprobe: Kandidaten nach SHA-256("konstellation-si-v1:"+record_ID) sortiert.
// Aufruf: npm run import:images:si -- [anzahl] [metadateien]
import { fetchBuf, sha256, log } from './lib.js';
import { loadImageManifest, acquireImage, finish } from './images-common.js';

const BUCKET = 'https://smithsonian-open-access.s3-us-west-2.amazonaws.com/metadata/edan/saam';
const N = Number(process.argv[2] || 20);
const FILES = Number(process.argv[3] || 6);

const ft = (c, k) => (c.freetext?.[k] || []).map((x) => x.content);

async function main() {
  const manifest = loadImageManifest();
  const have = new Set(manifest.items.map((x) => x.id));
  const cands = [];
  for (let i = 0; i < FILES; i++) {
    const f = i.toString(16).padStart(2, '0');
    const { buf } = await fetchBuf(`${BUCKET}/${f}.txt`, { timeoutMs: 60000 });
    for (const line of buf.toString('utf8').split('\n')) {
      if (!line.trim()) continue;
      const d = JSON.parse(line); const c = d.content; const dn = c.descriptiveNonRepeating || {};
      if (!ft(c, 'objectType').some((t) => /Painting/i.test(t))) continue;
      if (dn.metadata_usage?.access !== 'CC0') continue;
      const media = (dn.online_media?.media || []).find((m) => m.type === 'Images' && m.usage?.access === 'CC0' && m.idsId);
      if (!media) continue;
      cands.push({ d, media, k: sha256(`konstellation-si-v1:${dn.record_ID}`) });
    }
  }
  cands.sort((a, b) => (a.k < b.k ? -1 : 1));
  log(`Kandidaten (Gemälde, CC0, mit Bild): ${cands.length}`);
  const added = []; const rejected = [];
  let got = manifest.items.filter((x) => x.provider === 'smithsonian').length;
  for (const { d, media } of cands) {
    if (got >= N) break;
    const c = d.content; const dn = c.descriptiveNonRepeating;
    const id = `si-${dn.record_ID}`;
    if (have.has(id)) continue;
    const url = `https://ids.si.edu/ids/deliveryService?id=${encodeURIComponent(media.idsId)}&max=1200`;
    const names = (c.freetext.name || []);
    try {
      const item = await acquireImage({
        id, url, provider: 'smithsonian',
        meta: {
          title: dn.title?.content || d.title || null,
          artist: names.find((n) => /Artist/i.test(n.label))?.content || names[0]?.content || null,
          artist_bio: null, date: ft(c, 'date')[0] || null,
          medium: (c.freetext.physicalDescription || []).find((x) => x.label === 'Medium')?.content || null,
          culture: null, department: 'Smithsonian American Art Museum', department_id: null,
          object_number: ft(c, 'identifier')[0] || null, credit_line: ft(c, 'creditLine')[0] || null,
          source_url: dn.record_link || dn.guid, source_name: 'Smithsonian Open Access – Smithsonian American Art Museum',
          rights: 'CC0 1.0 – Smithsonian Open Access (metadata_usage.access=CC0, media usage.access=CC0)',
          rights_evidence: { metadata_usage: dn.metadata_usage, media_usage: media.usage, ids_id: media.idsId },
          retrieved_at: new Date().toISOString(),
        },
        rawMeta: d,
      });
      added.push(item); got++; have.add(id);
      log('ok', id, item.title?.slice(0, 50), `${item.width}×${item.height}`);
    } catch (e) { rejected.push({ id, reason: e.message, at: new Date().toISOString() }); log('verworfen', id, e.message); }
  }
  finish(manifest, added, rejected);
}
main().catch((e) => { console.error(e); process.exit(1); });
