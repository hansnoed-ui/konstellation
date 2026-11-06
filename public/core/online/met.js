// Anbieter Met Museum (Collection API): Auswahlraum = Liste aller Objekt-IDs zum Abfragezeitpunkt.
// Freigabe: isPublicDomain=true (Met Open Access, CC0). Bild: primaryImageSmall (web-large) oder primaryImage.
import { fetchWithTimeout } from '../openmeteo.js';
import { Reject } from '../online.js';

export const MET_API = 'https://collectionapi.metmuseum.org/public/collection/v1';

export function metProvider({ api = MET_API, listMaxAgeMs = 3600e3 } = {}) {
  let cache = null; // { ids, retrieved_at, at }
  return {
    id: 'met', name: 'The Metropolitan Museum of Art, Open Access (Collection API)',
    async space(ctx) {
      if (cache && ctx.nowMs() - cache.at < listMaxAgeMs) return { total: cache.ids.length, retrieved_at: cache.retrieved_at, note: 'alle Objekt-IDs (Liste zwischengespeichert)' };
      const res = await fetchWithTimeout(ctx.fetchImpl, `${api}/objects`, Math.min(ctx.left(), 8000), ctx.headers);
      if (!res.ok) throw new Error(`ID-Liste: HTTP ${res.status}`);
      const j = await res.json();
      if (!Array.isArray(j.objectIDs) || !j.objectIDs.length) throw new Error('ID-Liste leer oder unerwartet');
      cache = { ids: j.objectIDs, retrieved_at: new Date(ctx.nowMs()).toISOString(), at: ctx.nowMs() };
      return { total: cache.ids.length, retrieved_at: cache.retrieved_at, note: 'alle Objekt-IDs der Sammlung' };
    },
    async resolve(index, ctx) {
      const id = cache.ids[index]; const sid = `met-${id}`;
      const r = await fetchWithTimeout(ctx.fetchImpl, `${api}/objects/${id}`, Math.min(ctx.left(), 5000), ctx.headers);
      if (!r.ok) throw new Reject(`HTTP ${r.status}`, { id: sid });
      const obj = await r.json();
      if (obj.isPublicDomain !== true) throw new Reject('nicht freigegeben (isPublicDomain≠true)', { id: sid });
      const url = obj.primaryImageSmall || obj.primaryImage;
      if (!url) throw new Reject('kein Bild', { id: sid });
      let file = null;
      if (ctx.fetchImage) { try { file = await ctx.fetchImage(url, sid, Math.min(ctx.left(), 8000)); } catch (e) { throw new Reject('Bilddatei: ' + e.message, { id: sid }); } }
      return {
        id: sid, provider: 'met', source_mode: 'online',
        title: obj.title || null, artist: obj.artistDisplayName || null, artist_bio: obj.artistDisplayBio || null,
        date: obj.objectDate || null, medium: obj.medium || null, culture: obj.culture || null,
        department: obj.department || null, object_number: obj.accessionNumber || null, credit_line: obj.creditLine || null,
        source_url: obj.objectURL || `https://www.metmuseum.org/art/collection/search/${id}`, source_name: 'The Metropolitan Museum of Art, Open Access (Live-Abruf)',
        rights: 'Public Domain – Met Open Access (CC0 1.0); API-Feld isPublicDomain=true',
        rights_class: 'cc0', rights_evidence: { field: 'isPublicDomain', value: obj.isPublicDomain, metadataDate: obj.metadataDate || null },
        retrieved_at: new Date(ctx.nowMs()).toISOString(), image_url: url,
        ...fileFields(file), raw_metadata: obj,
      };
    },
  };
}
export const fileFields = (f) => ({ file: f?.file ?? null, local_url: f?.url ?? null, sha256: f?.sha256 ?? null, bytes: f?.bytes ?? null, mime: f?.mime ?? null, width: f?.width ?? null, height: f?.height ?? null, verified_locally: Boolean(f) });
