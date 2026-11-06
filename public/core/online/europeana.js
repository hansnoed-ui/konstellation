// Anbieter Europeana (Search API, braucht einen kostenlosen API-Schlüssel): Auswahlraum = alle Bilder mit
// reusability=open (CC0, Public Domain Mark, CC BY, CC BY-SA) und Mediendatei, adressiert über rows=1&start=<i>.
// Freigabe: edmRights des Datensatzes muss eine der offenen Lizenzen sein; die Einordnung steht in rights_class.
import { fetchWithTimeout } from '../openmeteo.js';
import { Reject } from '../online.js';
import { fileFields } from './met.js';

export const EUROPEANA_API = 'https://api.europeana.eu/record/v2/search.json';
const OPEN = [
  [/publicdomain\/zero/, 'cc0', 'CC0 1.0'], [/publicdomain\/mark/, 'pdm', 'Public Domain Mark'],
  [/licenses\/by\/\d/, 'cc-by', 'CC BY'], [/licenses\/by-sa\/\d/, 'cc-by-sa', 'CC BY-SA'],
];
export function classifyRights(url) { for (const [re, c, label] of OPEN) if (re.test(url || '')) return { rights_class: c, label }; return null; }

export function europeanaProvider({ api = EUROPEANA_API, key, maxAgeMs = 3600e3, query = 'TYPE:IMAGE' } = {}) {
  let cache = null;
  const base = () => `${api}?wskey=${encodeURIComponent(key)}&query=${encodeURIComponent(query)}&reusability=open&media=true&rows=1`;
  return {
    id: 'europeana', name: 'Europeana (Search API, offene Lizenzen)',
    async space(ctx) {
      if (!key) throw new Error('kein API-Schlüssel konfiguriert');
      if (cache && ctx.nowMs() - cache.at < maxAgeMs) return { total: cache.total, retrieved_at: cache.retrieved_at, note: cache.note };
      const r = await fetchWithTimeout(ctx.fetchImpl, base() + '&start=1&profile=minimal', Math.min(ctx.left(), 6000), ctx.headers);
      if (!r.ok) throw new Error(`Gesamtzahl: HTTP ${r.status}`);
      const j = await r.json(); if (j.success === false) throw new Error(j.error || 'Fehler');
      const total = Number(j.totalResults); if (!(total > 0)) throw new Error('Gesamtzahl unerwartet');
      cache = { total, retrieved_at: new Date(ctx.nowMs()).toISOString(), at: ctx.nowMs(), note: `Bilder mit reusability=open und Mediendatei (${query})` };
      return { total, retrieved_at: cache.retrieved_at, note: cache.note };
    },
    async resolve(index, ctx) {
      const r = await fetchWithTimeout(ctx.fetchImpl, base() + `&start=${index + 1}&profile=rich`, Math.min(ctx.left(), 6000), ctx.headers);
      if (!r.ok) throw new Reject(`HTTP ${r.status}`, { id: `europeana-#${index}` });
      const j = await r.json(); const obj = j.items?.[0];
      if (!obj) throw new Reject(j.error ? 'API: ' + j.error : 'kein Eintrag an dieser Stelle', { id: `europeana-#${index}` });
      const sid = `europeana-${obj.id}`;
      const rightsUrl = (obj.rights || [])[0]; const cls = classifyRights(rightsUrl);
      if (!cls) throw new Reject(`nicht freigegeben (edmRights ${rightsUrl || 'fehlt'})`, { id: sid });
      const url = obj.edmIsShownBy?.[0] || obj.edmPreview?.[0];
      if (!url) throw new Reject('kein Bild', { id: sid });
      let file = null;
      if (ctx.fetchImage) { try { file = await ctx.fetchImage(url, sid, Math.min(ctx.left(), 8000)); } catch (e) { throw new Reject('Bilddatei: ' + e.message, { id: sid }); } }
      const t = (a) => (Array.isArray(a) ? a[0] : a) || null;
      return {
        id: sid, provider: 'europeana', source_mode: 'online',
        title: t(obj.title), artist: t(obj.dcCreator) || t(obj.dcCreatorLangAware?.def) || null, artist_bio: null,
        date: t(obj.year) || t(obj.edmTimespanLabel?.map?.((x) => x.def)) || null, medium: t(obj.dcType) || null, culture: t(obj.country) || null,
        department: t(obj.dataProvider) || null, object_number: obj.id, credit_line: t(obj.provider) || null,
        source_url: obj.guid || `https://www.europeana.eu/item${obj.id}`, source_name: `Europeana – ${t(obj.dataProvider) || 'Datenlieferant'} (Live-Abruf)`,
        rights: `${cls.label} laut edmRights (${rightsUrl}); Datenlieferant ${t(obj.dataProvider) || '?'}` + (cls.rights_class.startsWith('cc-by') ? '; Namensnennung erforderlich' : ''),
        rights_class: cls.rights_class, rights_evidence: { field: 'edmRights', value: rightsUrl },
        retrieved_at: new Date(ctx.nowMs()).toISOString(), image_url: url,
        ...fileFields(file), raw_metadata: obj,
      };
    },
  };
}
