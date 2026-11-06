// Import: The Metropolitan Museum of Art – Collection API, nur Objekte mit isPublicDomain=true
// (Met Open Access, CC0). Stichprobe je Abteilung: Objekt-IDs werden nach SHA-256("konstellation-met-v1:"+id)
// sortiert; der Reihe nach werden Objekte geprüft, bis die Zielzahl je Abteilung erreicht ist.
// Aufruf: npm run import:images:met -- [faktor]   (faktor multipliziert die Zielzahlen, z.B. 10)
import { sha256, fetchJson, sleep, log } from './lib.js';
import { loadImageManifest, acquireImage, finish } from './images-common.js';

const API = 'https://collectionapi.metmuseum.org/public/collection/v1';
const TARGETS = { 11: 14, 6: 8, 9: 8, 19: 5, 14: 3, 21: 2 }; // Abteilung -> Anzahl
const factor = Number(process.argv[2] || 1);

async function main() {
  const manifest = loadImageManifest();
  const have = new Set(manifest.items.map((x) => x.id));
  const added = []; const rejected = [];
  for (const [dept, n0] of Object.entries(TARGETS)) {
    const n = Math.round(n0 * factor);
    const { json } = await fetchJson(`${API}/objects?departmentIds=${dept}`);
    const order = json.objectIDs.map((id) => ({ id, k: sha256(`konstellation-met-v1:${id}`) })).sort((a, b) => (a.k < b.k ? -1 : 1));
    let got = manifest.items.filter((x) => x.provider === 'met' && String(x.department_id) === dept).length;
    for (const { id } of order) {
      if (got >= n) break;
      const mid = `met-${id}`;
      if (have.has(mid)) continue;
      await sleep(150);
      let obj;
      try { obj = (await fetchJson(`${API}/objects/${id}`)).json; } catch (e) { rejected.push({ id: mid, reason: 'Metadaten: ' + e.message }); continue; }
      if (obj.isPublicDomain !== true) continue; // nicht freigegeben: nicht übernehmen (still übersprungen, nicht als Fehler)
      const url = obj.primaryImageSmall || obj.primaryImage;
      if (!url) { rejected.push({ id: mid, reason: 'kein Bild-URL trotz isPublicDomain' }); continue; }
      try {
        const item = await acquireImage({
          id: mid, url, provider: 'met',
          meta: {
            title: obj.title || null, artist: obj.artistDisplayName || null, artist_bio: obj.artistDisplayBio || null,
            date: obj.objectDate || null, medium: obj.medium || null, culture: obj.culture || null,
            department: obj.department, department_id: Number(dept), object_number: obj.accessionNumber || null,
            credit_line: obj.creditLine || null, source_url: obj.objectURL,
            source_name: 'The Metropolitan Museum of Art, Open Access',
            rights: 'Public Domain – Met Open Access (CC0 1.0); API-Feld isPublicDomain=true',
            rights_evidence: { isPublicDomain: obj.isPublicDomain, metadataDate: obj.metadataDate || null },
            retrieved_at: new Date().toISOString(),
          },
          rawMeta: obj,
        });
        added.push(item); got++; have.add(mid);
        log('ok', mid, item.title?.slice(0, 50), `${item.width}×${item.height}`);
      } catch (e) { rejected.push({ id: mid, reason: e.message, at: new Date().toISOString() }); log('verworfen', mid, e.message); }
    }
  }
  finish(manifest, added, rejected);
}
main().catch((e) => { console.error(e); process.exit(1); });
