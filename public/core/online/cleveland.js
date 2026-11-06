// Anbieter Cleveland Museum of Art (Open Access API): Auswahlraum = alle Werke mit cc0=1 und has_image=1
// (info.total), direkt über skip/limit adressierbar. Freigabe: share_license_status = «CC0».
import { fetchWithTimeout } from '../openmeteo.js';
import { Reject } from '../online.js';
import { fileFields } from './met.js';

export const CMA_API = 'https://openaccess-api.clevelandart.org/api/artworks/';
const FIELDS = 'id,accession_number,title,creators,creation_date,technique,culture,department,type,url,share_license_status,images,creditline,tombstone';

export function clevelandProvider({ api = CMA_API, maxAgeMs = 3600e3 } = {}) {
  let cache = null;
  return {
    id: 'cma', name: 'Cleveland Museum of Art, Open Access API',
    async space(ctx) {
      if (cache && ctx.nowMs() - cache.at < maxAgeMs) return { total: cache.total, retrieved_at: cache.retrieved_at, note: 'Werke mit cc0=1 und has_image=1' };
      const r = await fetchWithTimeout(ctx.fetchImpl, `${api}?cc0=1&has_image=1&limit=1&fields=id`, Math.min(ctx.left(), 6000), ctx.headers);
      if (!r.ok) throw new Error(`Gesamtzahl: HTTP ${r.status}`);
      const total = Number((await r.json()).info?.total); if (!(total > 0)) throw new Error('Gesamtzahl unerwartet');
      cache = { total, retrieved_at: new Date(ctx.nowMs()).toISOString(), at: ctx.nowMs() };
      return { total, retrieved_at: cache.retrieved_at, note: 'Werke mit cc0=1 und has_image=1 (skip/limit)' };
    },
    async resolve(index, ctx) {
      const r = await fetchWithTimeout(ctx.fetchImpl, `${api}?cc0=1&has_image=1&limit=1&skip=${index}&fields=${FIELDS}`, Math.min(ctx.left(), 6000), ctx.headers);
      if (!r.ok) throw new Reject(`HTTP ${r.status}`, { id: `cma-#${index}` });
      const obj = (await r.json()).data?.[0];
      if (!obj) throw new Reject('kein Eintrag an dieser Stelle (Liste verändert)', { id: `cma-#${index}` });
      const sid = `cma-${obj.id}`;
      if (obj.share_license_status !== 'CC0') throw new Reject(`nicht freigegeben (share_license_status=${obj.share_license_status})`, { id: sid });
      const url = obj.images?.web?.url || obj.images?.print?.url;
      if (!url) throw new Reject('kein Bild', { id: sid });
      let file = null;
      if (ctx.fetchImage) { try { file = await ctx.fetchImage(url, sid, Math.min(ctx.left(), 8000)); } catch (e) { throw new Reject('Bilddatei: ' + e.message, { id: sid }); } }
      const cr = obj.creators?.[0];
      return {
        id: sid, provider: 'cma', source_mode: 'online',
        title: obj.title || null, artist: cr?.description?.replace(/\s*\(.*$/, '') || null, artist_bio: cr?.description?.match(/\((.*)\)/)?.[1] || null,
        date: obj.creation_date || null, medium: obj.technique || null, culture: Array.isArray(obj.culture) ? obj.culture.join('; ') : obj.culture || null,
        department: obj.department || null, object_number: obj.accession_number || null, credit_line: obj.creditline || null,
        source_url: obj.url || `https://www.clevelandart.org/art/${obj.accession_number}`, source_name: 'Cleveland Museum of Art, Open Access (Live-Abruf)',
        rights: 'Public Domain – Cleveland Museum of Art Open Access (CC0 1.0); API-Feld share_license_status=CC0',
        rights_class: 'cc0', rights_evidence: { field: 'share_license_status', value: obj.share_license_status },
        retrieved_at: new Date(ctx.nowMs()).toISOString(), image_url: url,
        ...fileFields(file), raw_metadata: obj,
      };
    },
  };
}
