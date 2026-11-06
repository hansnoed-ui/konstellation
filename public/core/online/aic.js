// Anbieter Art Institute of Chicago (public API): Auswahlraum = ID-Raum 1…höchste Werk-ID zum Abfragezeitpunkt
// (die IDs sind lückenhaft; Lücken werden als «keine Objekt-ID» verworfen und ersetzt). Freigabe: is_public_domain=true
// (AIC Open Access, CC0). Bild über den IIIF-Dienst (Breite 843 px, von AIC empfohlen).
import { fetchWithTimeout } from '../openmeteo.js';
import { Reject } from '../online.js';
import { fileFields } from './met.js';

export const AIC_API = 'https://api.artic.edu/api/v1';
export const AIC_IIIF = 'https://www.artic.edu/iiif/2';
const FIELDS = 'id,title,artist_display,artist_title,date_display,medium_display,place_of_origin,dimensions,credit_line,is_public_domain,copyright_notice,image_id,department_title,main_reference_number';

export function aicProvider({ api = AIC_API, iiif = AIC_IIIF, maxAgeMs = 3600e3 } = {}) {
  let cache = null;
  return {
    id: 'aic', name: 'Art Institute of Chicago (public API, Open Access)',
    async space(ctx) {
      if (cache && ctx.nowMs() - cache.at < maxAgeMs) return { total: cache.maxId, retrieved_at: cache.retrieved_at, note: cache.note };
      const res = await fetchWithTimeout(ctx.fetchImpl, `${api}/artworks/search?limit=1&fields=id&sort%5Bid%5D=desc`, Math.min(ctx.left(), 6000), ctx.headers);
      if (!res.ok) throw new Error(`höchste ID: HTTP ${res.status}`);
      const j = await res.json(); const maxId = Number(j.data?.[0]?.id); const total = Number(j.pagination?.total);
      if (!(maxId > 0)) throw new Error('höchste ID unerwartet');
      cache = { maxId, retrieved_at: new Date(ctx.nowMs()).toISOString(), at: ctx.nowMs(), note: `ID-Raum 1…${maxId}` + (total ? ` (${total} Werke, Lücken werden ersetzt)` : '') };
      return { total: maxId, retrieved_at: cache.retrieved_at, note: cache.note };
    },
    async resolve(index, ctx) {
      const id = index + 1; const sid = `aic-${id}`;
      const r = await fetchWithTimeout(ctx.fetchImpl, `${api}/artworks/${id}?fields=${FIELDS}`, Math.min(ctx.left(), 5000), ctx.headers);
      if (r.status === 404) throw new Reject('keine Objekt-ID (Lücke im ID-Raum)', { id: sid });
      if (!r.ok) throw new Reject(`HTTP ${r.status}`, { id: sid });
      const obj = (await r.json()).data;
      if (!obj) throw new Reject('keine Objekt-ID', { id: sid });
      if (obj.is_public_domain !== true) throw new Reject('nicht freigegeben (is_public_domain≠true)', { id: sid });
      if (!obj.image_id) throw new Reject('kein Bild', { id: sid });
      const url = `${iiif}/${obj.image_id}/full/843,/0/default.jpg`;
      let file = null;
      if (ctx.fetchImage) { try { file = await ctx.fetchImage(url, sid, Math.min(ctx.left(), 8000)); } catch (e) { throw new Reject('Bilddatei: ' + e.message, { id: sid }); } }
      return {
        id: sid, provider: 'aic', source_mode: 'online',
        title: obj.title || null, artist: obj.artist_title || (obj.artist_display || '').split('\n')[0] || null, artist_bio: (obj.artist_display || '').split('\n').slice(1).join(', ') || null,
        date: obj.date_display || null, medium: obj.medium_display || null, culture: obj.place_of_origin || null,
        department: obj.department_title || null, object_number: obj.main_reference_number || null, credit_line: obj.credit_line || null,
        source_url: `https://www.artic.edu/artworks/${id}`, source_name: 'Art Institute of Chicago, Open Access (Live-Abruf)',
        rights: 'Public Domain – Art Institute of Chicago Open Access (CC0 1.0); API-Feld is_public_domain=true',
        rights_class: 'cc0', rights_evidence: { field: 'is_public_domain', value: obj.is_public_domain, copyright_notice: obj.copyright_notice ?? null },
        retrieved_at: new Date(ctx.nowMs()).toISOString(), image_url: url,
        ...fileFields(file), raw_metadata: obj,
      };
    },
  };
}
