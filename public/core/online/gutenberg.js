// Anbieter Project Gutenberg: Auswahlraum entweder die Werkliste der gewählten Sprachen aus dem mitgelieferten
// Katalogindex (catalog/online/gutenberg-index.json, aus pg_catalog.csv, Stand im Index) oder – bei «alle Sprachen» –
// der ganze ID-Raum 1…höchste ID (Lücken werden ersetzt). Je gezogenem Werk werden die Metadaten (RDF) und der
// UTF-8-Volltext geladen; Freigabe nur bei dcterms:rights = «Public domain in the USA.» und Typ «Text».
// Rechte: Project Gutenberg bestätigt die Gemeinfreiheit in den USA. Für die Schweiz/EU gilt 70 Jahre nach dem Tod
// der Urheber:innen; aus dem RDF-Todesjahr wird deshalb zusätzlich eingeordnet (rights_class), ohne Rechtsgarantie.
import { fetchWithTimeout } from '../openmeteo.js';
import { Reject } from '../online.js';
import { passagesFromPlain } from '../text-plain.js';
import { decodeEntities } from '../passages.js';

export const GUTENBERG = 'https://www.gutenberg.org';
const MAX_TEXT_BYTES = 6e6;

export function gutenbergProvider({ base = GUTENBERG, rewrite = (u) => u, languages = ['de'], loadIndex, minPassages = 20 } = {}) {
  let idx = null;
  const allLang = !languages.length;
  return {
    id: 'gutenberg', name: 'Project Gutenberg' + (allLang ? ' (alle Sprachen, ID-Raum)' : ` (Sprachen ${languages.join(', ')}, Katalogindex)`),
    async space() {
      idx = await loadIndex();
      if (allLang) return { total: idx.max_id, retrieved_at: idx.retrieved_at, note: `ID-Raum 1…${idx.max_id} (Katalogstand ${idx.retrieved_at}; Lücken und Nicht-Texte werden ersetzt)` };
      const ids = [].concat(...languages.map((l) => idx.languages[l] || []));
      if (!ids.length) throw new Error('keine Werke für ' + languages.join(','));
      ids.sort((a, b) => a - b); idx._ids = ids;
      return { total: ids.length, retrieved_at: idx.retrieved_at, note: `Werke mit Sprache ${languages.join('/')} laut pg_catalog.csv (Stand ${idx.retrieved_at})` };
    },
    async resolve(index, ctx) {
      const id = allLang ? index + 1 : idx._ids[index]; const sid = `gutenberg-${id}`;
      const r = await fetchWithTimeout(ctx.fetchImpl, rewrite(`${base}/cache/epub/${id}/pg${id}.rdf`), Math.min(ctx.left(), 5000), ctx.headers);
      if (r.status === 404) throw new Reject('keine Werk-ID (Lücke im ID-Raum)', { id: sid });
      if (!r.ok) throw new Reject(`Metadaten: HTTP ${r.status}`, { id: sid });
      const meta = parseRdf(await r.text());
      if (meta.type !== 'Text') throw new Reject(`kein Text (Typ ${meta.type || '?'})`, { id: sid });
      if (meta.rights !== 'Public domain in the USA.') throw new Reject(`nicht freigegeben (Rechte: ${meta.rights || 'unbekannt'})`, { id: sid });
      if (!allLang && !meta.languages.some((l) => languages.includes(l))) throw new Reject(`Sprache ${meta.languages.join(',') || '?'} nicht gewählt`, { id: sid });
      const txtUrl = `${base}/cache/epub/${id}/pg${id}.txt`; // feste, umleitungsfreie Adresse (die RDF-Adresse leitet auf http um)
      const t = await fetchWithTimeout(ctx.fetchImpl, rewrite(txtUrl), Math.min(ctx.left(), 10000), ctx.headers);
      if (!t.ok) throw new Reject(`Volltext: HTTP ${t.status}`, { id: sid });
      const len = Number(t.headers.get('content-length')); if (len > MAX_TEXT_BYTES) throw new Reject(`Volltext zu gross (${len} Bytes)`, { id: sid });
      const text = await t.text(); if (text.length > MAX_TEXT_BYTES) throw new Reject('Volltext zu gross', { id: sid });
      let doc; try { doc = passagesFromPlain(text); } catch (e) { throw new Reject('Volltext: ' + e.message, { id: sid }); }
      if (doc.passages.length < minPassages) throw new Reject(`zu wenige Stellen (${doc.passages.length})`, { id: sid });
      const year = new Date(ctx.nowMs()).getUTCFullYear();
      const deaths = meta.creators.map((c) => c.death).filter((d) => d !== null);
      const pma = deaths.length && deaths.every((d) => year - d > 70);
      const rights_class = pma ? 'public-domain-70pma' : 'public-domain-usa';
      return {
        id: sid, provider: 'gutenberg', source_mode: 'online',
        title: meta.title || `Gutenberg #${id}`, author: meta.creators.map((c) => c.name).join('; ') || 'unbekannt', creators: meta.creators,
        languages: meta.languages, issued: meta.issued, subjects: meta.subjects, bookshelves: meta.bookshelves,
        source_url: `${base}/ebooks/${id}`, text_url: txtUrl, text_url_rdf: meta.text_url, source_name: 'Project Gutenberg (Live-Abruf)',
        rights: `Public Domain in den USA laut Project Gutenberg (dcterms:rights «${meta.rights}»). ` + (pma ? `Urheber:innen gestorben ${deaths.join('/')}: Schutzfrist 70 Jahre nach dem Tod (CH/EU) abgelaufen.` : 'Schutzfrist nach CH/EU-Regel (70 Jahre nach dem Tod) aus den Metadaten nicht belegt – ausserhalb der USA nur unter Vorbehalt.') + ' Nutzung nach der Project-Gutenberg-Lizenz (Markenname nur unverändert).',
        rights_class, rights_evidence: { field: 'dcterms:rights', value: meta.rights, deathdates: deaths, year_checked: year },
        attribution: `${meta.creators.map((c) => c.name).join('; ') || 'unbekannt'}: ${meta.title}. Project Gutenberg eBook #${id}, ${base}/ebooks/${id}.`,
        retrieved_at: new Date(ctx.nowMs()).toISOString(), text_sha256: null, text_bytes: text.length,
        passages_doc: doc, passage_count: doc.passages.length,
      };
    },
  };
}

export function parseRdf(x) {
  const g = (re) => { const m = x.match(re); return m ? decodeEntities(m[1].trim()) : null; };
  const all = (re) => { const o = []; let m; const r = new RegExp(re.source, 'g' + re.flags.replace('g', '')); while ((m = r.exec(x))) o.push(decodeEntities(m[1].trim())); return o; };
  const creators = [];
  const cre = /<dcterms:creator>[\s\S]*?<\/dcterms:creator>/g; let m;
  while ((m = cre.exec(x))) {
    const c = m[0]; const n = (c.match(/<pgterms:name>([^<]*)</) || [])[1]; if (!n) continue;
    const b = c.match(/<pgterms:birthdate[^>]*>(-?\d+)</); const d = c.match(/<pgterms:deathdate[^>]*>(-?\d+)</);
    creators.push({ name: decodeEntities(n), birth: b ? Number(b[1]) : null, death: d ? Number(d[1]) : null });
  }
  const langs = all(/<dcterms:language>[\s\S]*?<rdf:value[^>]*>([^<]*)</);
  const files = []; const fre = /<pgterms:file rdf:about="([^"]+)">([\s\S]*?)<\/pgterms:file>/g;
  while ((m = fre.exec(x))) { const fmt = (m[2].match(/<rdf:value[^>]*>([^<]*)</) || [])[1] || ''; files.push({ url: m[1], format: fmt }); }
  const txt = files.find((f) => f.format.startsWith('text/plain') && /utf-8/i.test(f.format) && !f.url.endsWith('.zip')) || files.find((f) => f.format.startsWith('text/plain') && !f.url.endsWith('.zip'));
  return {
    title: g(/<dcterms:title>([^<]*)</), issued: g(/<dcterms:issued[^>]*>([^<]*)</), rights: g(/<dcterms:rights>([^<]*)</),
    type: (x.match(/<dcterms:type>[\s\S]*?<rdf:value[^>]*>([^<]*)</) || [])[1] || null,
    languages: langs, creators, subjects: all(/<dcterms:subject>[\s\S]*?<rdf:value[^>]*>([^<]*)</), bookshelves: all(/<pgterms:bookshelf>[\s\S]*?<rdf:value[^>]*>([^<]*)</),
    text_url: txt ? txt.url.replace(/^http:/, 'https:') : null,
  };
}
