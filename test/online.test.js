// Online-Ziehung gegen simulierte Anbieter (echter HTTP-Server): Erfolg, Verwerfen und Ersatz, Rechteprüfung,
// defekte Dateien, Zeitüberschreitung → Rückfall auf den Bestand, Schalter aus.
import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { runConstellation, verifyRecord } from '../public/core/pipeline.js';
import { makeOnline } from '../public/core/online-deps.js';
import { makeImageFetcher } from '../server/deps.js';
import { passagesFromPlain } from '../public/core/text-plain.js';
import { clevelandProvider } from '../public/core/online/cleveland.js';
import { sbdbProvider, gaiaProvider } from '../public/core/online/astro.js';
import { fakeDeps, okWeather, catalogDir, cleanup, cfg } from './helpers.js';

const input = { name: 'Ada Lovelace', lat: 47.3769, lon: 8.5417, place_label: 'Zürich' };
const jpeg = fs.readFileSync(path.join(catalogDir, 'images', 'files', fs.readdirSync(path.join(catalogDir, 'images', 'files')).find((f) => f.endsWith('.jpg'))));
const S = { cmaTotal: 5, cmaCC0: () => true, sbdbCount: 50, gaiaDown: false, metPublic: () => true, aicExists: () => true, aicPublic: () => true, gutRights: () => 'Public domain in the USA.', gutLang: () => 'de', gutType: () => 'Text', delayMs: 0, brokenImage: false, metIds: [11, 12, 13, 14, 15, 16, 17, 18], aicMax: 8, gutIds: [101, 102, 103, 104] };
const paras = Array.from({ length: 60 }, (_, i) => `Absatz ${i + 1}. ` + 'Der Morgen kam langsam über die Hügel, und die Vögel begannen ihr Lied in den alten Bäumen des Gartens. '.repeat(3) + 'Niemand sprach ein Wort, denn alle warteten auf den Regen, der seit Tagen angekündigt war und doch nicht fiel.');
const gutText = (id) => `The Project Gutenberg eBook of Testwerk ${id}\n\nTitle: Testwerk\n\n*** START OF THE PROJECT GUTENBERG EBOOK TESTWERK ***\n\nTestwerk ${id}\n\nInhalt\n\n Erstes Kapitel\n Zweites Kapitel\n\nErstes Kapitel\n\n${paras.slice(0, 30).join('\n\n')}\n\nZweites Kapitel\n\n${paras.slice(30).join('\n\n')}\n\n*** END OF THE PROJECT GUTENBERG EBOOK TESTWERK ***\nLizenz …`;
const rdf = (id) => `<?xml version="1.0"?><rdf:RDF><pgterms:ebook rdf:about="ebooks/${id}"><dcterms:title>Testwerk ${id}</dcterms:title><dcterms:creator><pgterms:agent><pgterms:name>Muster, Erika</pgterms:name><pgterms:birthdate rdf:datatype="x">1850</pgterms:birthdate><pgterms:deathdate rdf:datatype="x">1920</pgterms:deathdate></pgterms:agent></dcterms:creator><dcterms:rights>${S.gutRights(id)}</dcterms:rights><dcterms:language><rdf:Description><rdf:value rdf:datatype="x">${S.gutLang(id)}</rdf:value></rdf:Description></dcterms:language><dcterms:type><rdf:Description><rdf:value>${S.gutType(id)}</rdf:value></rdf:Description></dcterms:type><dcterms:hasFormat><pgterms:file rdf:about="https://www.gutenberg.org/ebooks/${id}.txt.utf-8"><dcterms:format><rdf:Description><rdf:value rdf:datatype="x">text/plain; charset=utf-8</rdf:value></rdf:Description></dcterms:format></pgterms:file></dcterms:hasFormat></pgterms:ebook></rdf:RDF>`;

let server; let base;
before(async () => {
  server = http.createServer(async (req, res) => {
    if (S.delayMs) await new Promise((r) => setTimeout(r, S.delayMs));
    const u = new URL(req.url, 'http://x'); const p = u.pathname; const json = (o, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    let m;
    if (p === '/met/objects') return json({ total: S.metIds.length, objectIDs: S.metIds });
    if ((m = p.match(/^\/met\/objects\/(\d+)$/))) { const id = Number(m[1]); return json({ objectID: id, isPublicDomain: S.metPublic(id), title: `Met-Werk ${id}`, artistDisplayName: 'Kunstschaffende', objectURL: `${base}/met/page/${id}`, primaryImageSmall: `${base}/img/${id}.jpg`, metadataDate: '2026-01-01' }); }
    if (p === '/cma/') { const skip = Number(u.searchParams.get('skip') || 0); if (!u.searchParams.get('skip')) return json({ info: { total: S.cmaTotal }, data: [] }); if (skip >= S.cmaTotal) return json({ info: { total: S.cmaTotal }, data: [] }); const id = 900 + skip; return json({ info: { total: S.cmaTotal }, data: [{ id, title: `CMA-Werk ${id}`, share_license_status: S.cmaCC0(id) ? 'CC0' : 'Copyrighted', creators: [{ description: 'Jemand (Land, 1800–1870)' }], images: { web: { url: `${base}/img/${id}.jpg` } }, url: `${base}/cma/page/${id}` }] }); }
    if (p === '/sbdb/sbdb_query.api') return json({ count: S.sbdbCount });
    if (p === '/sbdb/sbdb.api') { const n = Number(u.searchParams.get('sstr')); if (n > S.sbdbCount) return json({ code: '200', message: 'specified object was not found' }); return json({ object: { fullname: `${n} (Test)`, des: String(n), kind: 'an', orbit_class: { name: 'Main-belt Asteroid' }, neo: false, pha: false }, orbit: { epoch: '2461200.5', elements: [{ name: 'a', value: '2.5' }, { name: 'e', value: '0.1' }, { name: 'i', value: '5' }, { name: 'q', value: '2.25' }, { name: 'per', value: '1444' }] }, phys_par: [{ name: 'H', value: '15.1' }] }); }
    if (p === '/gaia/sync') { const ri = Number((u.searchParams.get('QUERY') || '').match(/random_index = (\d+)/)?.[1]); if (S.gaiaDown) { res.writeHead(503); return res.end('SERVICE ERROR'); } return json({ metadata: [{ name: 'source_id' }, { name: 'random_index' }, { name: 'ra' }, { name: 'dec' }, { name: 'parallax' }, { name: 'phot_g_mean_mag' }], data: [[4000000000000000000 + ri, ri, 10.5, -20.25, 1.2, 18.3]] }); }
    if (p === '/aic/artworks/search') return json({ pagination: { total: S.aicMax }, data: [{ id: S.aicMax }] });
    if ((m = p.match(/^\/aic\/artworks\/(\d+)$/))) { const id = Number(m[1]); if (!S.aicExists(id)) return json({ status: 404 }, 404); return json({ data: { id, title: `AIC-Werk ${id}`, artist_title: 'AIC-Kunstschaffende', is_public_domain: S.aicPublic(id), image_id: `img-${id}`, copyright_notice: S.aicPublic(id) ? null : '© jemand' } }); }
    if ((m = p.match(/^\/iiif\/img-(\d+)\/full\/843,\/0\/default\.jpg$/)) || (m = p.match(/^\/img\/(\d+)\.jpg$/))) { res.writeHead(200, { 'Content-Type': 'image/jpeg' }); return res.end(S.brokenImage ? jpeg.subarray(0, 500) : jpeg); }
    if ((m = p.match(/^\/gut\/cache\/epub\/(\d+)\/pg\d+\.rdf$/))) { const id = Number(m[1]); if (!S.gutIds.includes(id)) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': 'application/rdf+xml' }); return res.end(rdf(id)); }
    if ((m = p.match(/^\/gut\/cache\/epub\/(\d+)\/pg\d+\.txt$/))) { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end(gutText(Number(m[1]))); }
    res.writeHead(404); res.end();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); cleanup(); });

const runtime = path.resolve(cfg.root, 'data/runtime/test-' + process.pid);
function online(over = {}) {
  return makeOnline({ budgetMs: over.budgetMs ?? 8000, maxTries: over.maxTries ?? 12, textLanguages: ['de'], images: over.images ?? ['met', 'aic'], astro: ['exoplanets-live', 'gaia', 'sbdb'] }, {
    met: { api: `${base}/met` }, aic: { api: `${base}/aic`, iiif: `${base}/iiif` }, cma: { api: `${base}/cma/` }, gutenberg: { base: `${base}/gut`, minPassages: 10 }, sbdb: { api: `${base}/sbdb` }, gaia: { tap: `${base}/gaia/sync`, total: 1000 },
    fetchImage: over.fetchImage === null ? null : makeImageFetcher(path.join(runtime, 'online-images')),
    loadIndex: async () => ({ retrieved_at: '2026-11-06T00:00:00.000Z', max_id: 104, languages: { de: S.gutIds } }),
  });
}
const reset = () => Object.assign(S, { cmaCC0: () => true, gaiaDown: false, metPublic: () => true, aicExists: () => true, aicPublic: () => true, gutRights: () => 'Public domain in the USA.', gutLang: () => 'de', gutType: () => 'Text', delayMs: 0, brokenImage: false });

test('online zuerst: Bild und Werk aus den simulierten Datenbanken, Rechte und Herkunft im Protokoll, Export mit Datei', async () => {
  reset();
  const r = await runConstellation({ ...input, online_first: true }, fakeDeps({ weatherLive: async () => okWeather(), online: online() }));
  assert.equal(r.culture.image.source_mode, 'online'); assert.equal(r.seeds.draws.image_source, 'online');
  assert.ok(['met', 'aic'].includes(r.culture.image.provider)); assert.equal(r.culture.image.rights_class, 'cc0'); assert.ok(r.culture.image.rights.includes('CC0'));
  assert.ok(r.culture.image.verified_locally && r.culture.image.sha256 && fs.existsSync(path.join(runtime, 'online-images', r.culture.image.file)));
  assert.equal(r.culture.image_online.total, S.metIds.length + S.aicMax, 'Gesamtraum = Summe der Anbieter');
  assert.deepEqual(r.culture.image_online.spaces.map((s) => s.provider), ['aic', 'met']);
  assert.equal(r.culture.text.work.source_mode, 'online'); assert.equal(r.culture.text.work.provider, 'gutenberg');
  assert.equal(r.culture.text.work.rights_class, 'public-domain-70pma'); assert.ok(r.culture.text.work.rights.includes('1920'));
  assert.ok(r.culture.text.passage.words >= 40); assert.equal(r.culture.text.passage_rule, 'passages-plain/1'); assert.equal(r.culture.text.passage.form, 'prosa');
  assert.ok(!r.culture.text.passage.text.includes('Inhalt'), 'Inhaltsverzeichnis nicht als Stelle');
  assert.ok(!('passages_doc' in r.culture.text.work), 'Volltext-Stellen nicht im Protokoll');
  assert.equal(r.input.online_first, true); assert.deepEqual(r.input.text_languages, ['de']);
  const v = await verifyRecord(r, fakeDeps()); assert.ok(v.ok); assert.equal(v.notes.length, 2);
});

test('nicht freigegebene Objekte und ID-Lücken werden verworfen und ersetzt; alle Versuche protokolliert', async () => {
  reset(); S.metPublic = (id) => id === 18; S.aicExists = (id) => id % 2 === 0; S.aicPublic = (id) => id === 8;
  const r = await runConstellation({ ...input, online_first: true }, fakeDeps({ weatherLive: async () => okWeather(), online: online({ maxTries: 40 }) }));
  assert.equal(r.culture.image.source_mode, 'online'); assert.ok(['met-18', 'aic-8'].includes(r.culture.image.id));
  const d = r.culture.image_online.draws; assert.ok(d.length > 1, 'mindestens ein Ersatz');
  assert.ok(d.slice(0, -1).every((x) => x.outcome.startsWith('verworfen')), JSON.stringify(d));
  assert.ok(d.some((x) => /isPublicDomain|is_public_domain|Lücke/.test(x.outcome)));
  assert.equal(d.at(-1).outcome, 'ok'); assert.ok(d.at(-1).label.startsWith('image-online#ersatz'));
  assert.equal(r.seeds.draws.image.length, d.length);
});

test('defekte Bilddatei wird verworfen; Zeitüberschreitung → Rückfall auf Bestand, unabhängig je Fund', async () => {
  reset(); S.brokenImage = true;
  let r = await runConstellation({ ...input, online_first: true }, fakeDeps({ weatherLive: async () => okWeather(), online: online({ maxTries: 3 }) }));
  assert.equal(r.culture.image.source_mode, 'local'); assert.ok(r.culture.image_online.outcome.includes('Rückfall'));
  assert.ok(r.culture.image_online.draws.every((d) => d.outcome.includes('Bilddatei')));
  assert.equal(r.culture.text.work.source_mode, 'online', 'Text fällt nicht mit dem Bild zurück');
  assert.ok(fs.existsSync(path.join(catalogDir, 'images', r.culture.image.file)));
  reset(); S.delayMs = 700; // jede Antwort 700 ms: Auswahlräume der Bildanbieter brauchen das Budget auf, der Volltext läuft in die Zeitüberschreitung
  r = await runConstellation({ ...input, online_first: true }, fakeDeps({ weatherLive: async () => okWeather(), online: online({ budgetMs: 1200 }) }));
  assert.equal(r.culture.image.source_mode, 'local'); assert.equal(r.culture.text.work.source_mode, 'local');
  assert.ok(r.technical_log.some((l) => l.step === 'image.online' && l.outcome.includes('Rückfall')));
  assert.ok((await verifyRecord(r, fakeDeps())).ok);
});

test('Gutenberg: fremde Rechteangabe, falsche Sprache oder Nicht-Text werden verworfen', async () => {
  reset(); S.gutRights = (id) => (id === 103 ? 'Public domain in the USA.' : 'Copyrighted. Read the copyright notice inside this book for details.'); S.gutLang = (id) => (id === 101 ? 'en' : 'de');
  const r = await runConstellation({ ...input, online_first: true }, fakeDeps({ weatherLive: async () => okWeather(), online: online({ maxTries: 20 }) }));
  assert.equal(r.culture.text.work.id, 'gutenberg-103');
  const d = r.culture.text_online.draws; assert.ok(d.slice(0, -1).every((x) => /nicht freigegeben|Sprache/.test(x.outcome)), JSON.stringify(d));
  reset(); S.gutRights = () => 'Copyrighted.';
  const r2 = await runConstellation({ ...input, online_first: true }, fakeDeps({ weatherLive: async () => okWeather(), online: online({ maxTries: 6 }) }));
  assert.equal(r2.culture.text.work.source_mode, 'local'); assert.ok(r2.culture.text_online.outcome.includes('Rückfall'));
});

test('Schalter aus oder Betriebsart ohne Online: Bestand, mit Protokolleintrag; Browser-Variante ohne Bilddownload', async () => {
  reset();
  const a = await runConstellation({ ...input, online_first: false }, fakeDeps({ weatherLive: async () => okWeather(), online: online() }));
  assert.equal(a.culture.image.source_mode, 'local'); assert.equal(a.culture.image_online, null); assert.equal(a.input.online_first, false);
  assert.ok(a.technical_log.some((l) => l.step === 'image.online' && l.outcome.includes('nicht gewünscht')));
  const b = await runConstellation({ ...input, online_first: true }, fakeDeps({ weatherLive: async () => okWeather() }));
  assert.equal(b.culture.image.source_mode, 'local'); assert.ok(b.technical_log.some((l) => l.step === 'text.online' && l.outcome.includes('nicht verfügbar')));
  const c = await runConstellation({ ...input, online_first: true }, fakeDeps({ weatherLive: async () => okWeather(), online: online({ fetchImage: null }) }));
  assert.equal(c.culture.image.source_mode, 'online'); assert.equal(c.culture.image.verified_locally, false); assert.equal(c.culture.image.file, null); assert.ok(c.culture.image.image_url.startsWith(base));
});

test('Volltextregel: Gutenberg-Vorspann entfernt, Überschriften als Abschnitte, Vers erkannt', () => {
  const verse = 'Zueignung\n\nIhr naht euch wieder, schwankende Gestalten,\nDie früh sich einst dem trüben Blick gezeigt.\nVersuch ich wohl, euch diesmal festzuhalten?\nFühl ich mein Herz noch jenem Wahn geneigt?\nIhr drängt euch zu! nun gut, so mögt ihr walten,\nWie ihr aus Dunst und Nebel um mich steigt;\nMein Busen fühlt sich jugendlich erschüttert\nVom Zauberhauch, der euren Zug umwittert.\n\n' + Array.from({ length: 6 }, () => 'Ihr bringt mit euch die Bilder froher Tage,\nUnd manche liebe Schatten steigen auf;\nGleich einer alten, halbverklungnen Sage\nKommt erste Lieb und Freundschaft mit herauf;\nDer Schmerz wird neu, es wiederholt die Klage\nDes Lebens labyrinthisch irren Lauf.').join('\n\n');
  const doc = passagesFromPlain(`Vorspann www.gutenberg.org\n\n*** START OF THE PROJECT GUTENBERG EBOOK X ***\n\n${verse}\n\nErstes Kapitel\n\n${paras.slice(0, 5).join('\n\n')}\n\n*** END OF THE PROJECT GUTENBERG EBOOK X ***\nLizenz`);
  assert.ok(doc.passages.some((p) => p.form === 'vers' && p.text.includes('\n') && p.chapter === 1 && p.heads[0] === 'Zueignung'), JSON.stringify(doc.passages.map((p) => [p.form, p.chapter, p.heads])));
  assert.ok(doc.passages.some((p) => p.form === 'prosa' && p.chapter === 2));
  assert.ok(!doc.passages.some((p) => p.text.includes('Vorspann') || p.text.includes('Lizenz')));
});

test('Cleveland (skip-Index) im Gesamtraum; nicht-CC0 wird verworfen', async () => {
  reset(); S.cmaCC0 = (id) => id !== 902;
  const r = await runConstellation({ ...input, online_first: true }, fakeDeps({ weatherLive: async () => okWeather(), online: online({ images: ['cma'], maxTries: 10 }) }));
  assert.equal(r.culture.image.provider, 'cma'); assert.equal(r.culture.image.rights_class, 'cc0'); assert.equal(r.culture.image_online.total, 5);
  assert.ok(r.culture.image_online.draws.every((d) => d.outcome === 'ok' || d.outcome.includes('share_license_status')));
});

test('Astronomie online: Kleinkörper (Nummer = Index + 1) und Gaia (random_index); Ausfall → Exoplaneten aus dem Bestand; Bestand-Seedform unverändert', async () => {
  reset();
  const a = await runConstellation({ ...input, online_first: true, astro_source: 'sbdb' }, fakeDeps({ weatherLive: async () => okWeather(), online: online() }));
  assert.equal(a.science.astro.kind, 'small-body'); assert.equal(a.science.astro.source_mode, 'online'); assert.equal(a.seeds.draws.astro_source, 'online');
  assert.equal(a.science.astro.record.number, a.seeds.draws.astro.index + 1); assert.equal(a.science.astro.online.total, 50);
  assert.equal(a.science.astro.used_for_seed.record.a, 2.5); assert.equal(a.input.astro_source, 'sbdb');
  const v = await verifyRecord(a, fakeDeps()); assert.ok(v.ok); assert.ok(v.notes.some((n) => n.includes('Astronomie online')));
  const g = await runConstellation({ ...input, online_first: true, astro_source: 'gaia' }, fakeDeps({ weatherLive: async () => okWeather(), online: online() }));
  assert.equal(g.science.astro.kind, 'star'); assert.equal(g.science.astro.record.random_index, g.seeds.draws.astro.index); assert.equal(g.science.astro.online.total, 1000);
  assert.notEqual(g.seeds.S1.hex, a.seeds.S1.hex, 'anderes Himmelsobjekt → anderes S1');
  reset(); S.gaiaDown = true;
  const f = await runConstellation({ ...input, online_first: true, astro_source: 'gaia' }, fakeDeps({ weatherLive: async () => okWeather(), online: online({ maxTries: 3 }) }));
  assert.equal(f.science.astro.source_mode, 'local'); assert.equal(f.science.astro.kind, 'exoplanet'); assert.ok(f.science.astro.online.outcome.includes('Rückfall'));
  const l = await runConstellation({ ...input, online_first: true }, fakeDeps({ weatherLive: async () => okWeather(), online: online() }));
  assert.equal(l.science.astro.source_mode, 'local'); assert.equal(l.science.astro.used_for_seed.catalog, 'NASA Exoplanet Archive pscomppars'); assert.equal(l.science.astro.online, null);
  assert.equal(l.seeds.S1.hex, f.seeds.S1.hex, 'Rückfall liefert dieselbe Auswahl wie der Bestand');
});

test('Browser-Fassung: Astronomie-Archive laufen über den Durchreicher (rewrite), ohne ihn keine Online-Astronomie', async () => {
  const seen = [];
  const rewrite = (u) => `${base}/proxy?u=${encodeURIComponent(u)}`;
  const fetchImpl = async (u, o) => { seen.push(u); const real = new URL(u).searchParams.get('u'); return fetch(real, o); };
  const on = makeOnline({ budgetMs: 8000, maxTries: 6, images: [], texts: [], astro: ['sbdb', 'gaia'] }, { fetchImpl, rewrite, sbdb: { api: `${base}/sbdb` }, gaia: { tap: `${base}/gaia/sync`, total: 1000 } });
  reset();
  const r = await runConstellation({ ...input, online_first: true, astro_source: 'sbdb' }, fakeDeps({ weatherLive: async () => okWeather(), online: on }));
  assert.equal(r.science.astro.kind, 'small-body'); assert.equal(r.science.astro.source_mode, 'online');
  assert.ok(seen.length >= 2 && seen.every((u) => u.startsWith(`${base}/proxy?u=`)), 'alle Astronomie-Abfragen über den Durchreicher');
  const off = makeOnline({ astro: [] }, { fetchImpl })({ astro_source: 'sbdb' });
  assert.equal(off.astro, null); assert.equal(off.astroSource, 'local');
});
