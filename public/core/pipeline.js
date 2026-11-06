// Ablauf einer Konstellation. Läuft unverändert im Node-Server (lokal) und im Browser (statische Fassung).
// Alle Nebenwirkungen (Netz, Dateien, Speicher, Uhr) kommen über `deps` herein.
import { ALGORITHM_VERSION, normalizeName, normalizeCoords, computeS0, computeS1, uniformIndex } from './seed.js';
import { sha256Hex } from './canonical.js';
import { WEATHER_FIELDS, pickFromArchive, ARCHIVE_RULE } from './weather.js';
import { ONLINE_RULE } from './online.js';

export const RULES = {
  algorithm: ALGORITHM_VERSION,
  canonical: 'JSON, Schlüssel sortiert (UTF-16), ohne Leerzeichen, Zahlen in ECMAScript-Darstellung (an RFC 8785 angelehnt)',
  s0: 'S0 = SHA-256(kanonisch({algorithm, stage:"S0", name: NFC+Leerraum normalisiert, lat/lon: 6 Nachkommastellen als Text, query_time_utc}))',
  s1: 'S1 = SHA-256(kanonisch({algorithm, stage:"S1", s0, weather: verwendeter Wetterdatensatz, astro: verwendeter Katalogeintrag}))',
  draw: 'Index = u mod n mit u = erste 8 Bytes von SHA-256(seed|label|k), verworfen solange u ≥ floor(2^64/n)·n',
  streams: { astro: 'S0|astro', image: 'S1|image', text_work: 'S1|text-work', text_passage: 'S1|text-passage' },
  replacement: 'Ist ein gezogener Bild-/Texteintrag lokal beschädigt (Prüfsumme/Datei), wird er aus der sortierten Menge entfernt und mit dem Label «<label>#ersatz<i>» erneut gezogen; jeder Ersatz wird protokolliert.',
  weather_order: 'Live (Open-Meteo, gesamt höchstens 5 s, höchstens 2 Versuche, kein Wiederholen nach 429) → Cache (gleiche Koordinaten auf 2 Nachkommastellen, Datenzeit höchstens 3 h vor Abfragezeitpunkt) → Archiv (' + ARCHIVE_RULE + ')',
  weather_archive: ARCHIVE_RULE,
  online: 'Standard «online zuerst»: Bild aus Strom S1|image-online, Werk aus Strom S1|text-online, jeweils ' + ONLINE_RULE + ' Die Stelle wird wie im Bestand mit S1|text-passage über die Stellen des gezogenen Werks gezogen.',
  fallback: 'Scheitert die Online-Ziehung (kein Anbieter, Zeitbudget, keine freigegebenen Treffer), kommt der betreffende Fund aus dem lokalen Bestand; Bild und Text fallen unabhängig voneinander zurück.',
};

const WEATHER_BUDGET_MS = 5000;

function weatherForSeed(w) {
  // Nur wissenschaftliche Inhalte – keine Abrufzeiten, Latenzen oder Protokolldaten.
  return {
    source: w.source, data_kind: w.data_kind, data_time_utc: w.data_time_utc,
    provided_lat: w.provided.lat ?? null, provided_lon: w.provided.lon ?? null,
    location_id: w.provided.location_id ?? null,
    values: Object.fromEntries(Object.keys(WEATHER_FIELDS).map((k) => [k, w.values[k]?.value ?? null])),
    units: Object.fromEntries(Object.keys(WEATHER_FIELDS).map((k) => [k, WEATHER_FIELDS[k].unit])),
  };
}

async function obtainWeather({ lat, lon, queryTime, deps, log }) {
  const started = deps.monotonic();
  // 1) Live
  if (deps.weatherLive) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const remaining = WEATHER_BUDGET_MS - (deps.monotonic() - started);
      if (remaining < 500) { log.push({ step: 'weather.live', attempt, outcome: 'übersprungen: Zeitbudget erschöpft' }); break; }
      const t0 = deps.monotonic();
      try {
        const r = await deps.weatherLive(lat, lon, Math.min(remaining, 4000));
        log.push({ step: 'weather.live', attempt, outcome: 'ok', duration_ms: Math.round(deps.monotonic() - t0), provider: r.provider });
        if (deps.weatherCachePut) { try { await deps.weatherCachePut(lat, lon, r); } catch (e) { log.push({ step: 'weather.cache.put', outcome: 'fehler', error: String(e.message || e) }); } }
        return { ...r, level: 'live', level_label: 'Aktueller Abruf' };
      } catch (e) {
        const entry = { step: 'weather.live', attempt, outcome: 'fehler', duration_ms: Math.round(deps.monotonic() - t0), error: String(e.message || e), http_status: e.status ?? null };
        log.push(entry);
        if (e.status === 429 || e.skipped || e.status === 400 || e.unexpected) break; // keine Wiederholung
      }
    }
  } else log.push({ step: 'weather.live', outcome: 'nicht konfiguriert' });
  // 2) Cache
  if (deps.weatherCacheGet) {
    try {
      const c = await deps.weatherCacheGet(lat, lon, queryTime);
      if (c) { log.push({ step: 'weather.cache', outcome: 'treffer', cached_at: c.retrieved_at }); return { ...c, level: 'cache', level_label: 'Zwischenspeicher (früherer Abruf)' }; }
      log.push({ step: 'weather.cache', outcome: 'kein passender Eintrag' });
    } catch (e) { log.push({ step: 'weather.cache', outcome: 'fehler', error: String(e.message || e) }); }
  }
  // 3) Archiv
  const archive = await deps.loadCatalog('weather-archive');
  const pick = pickFromArchive(archive, lat, lon, queryTime);
  if (!pick) throw new Error('Kein Wetterdatensatz verfügbar (Archiv leer).');
  log.push({ step: 'weather.archive', outcome: 'ok', location: pick.location.id, distance_km: pick.distance_km });
  return {
    level: 'archive', level_label: 'Archivbestand (abweichender Ort/Zeitpunkt)',
    source: pick.location.source, data_kind: pick.location.data_kind, provider: pick.location.source,
    data_time_utc: pick.record.data_time_utc,
    provided: { lat: pick.location.lat, lon: pick.location.lon, elevation_m: pick.location.elevation_m ?? null, location_id: pick.location.id, name: pick.location.name, kind: pick.location.source === 'noaa-isd' ? 'Wetterstation' : 'Rasterzelle des Wettermodells' },
    distance_km: pick.distance_km, values: pick.record.values,
    source_url: pick.location.source_url, raw: { record_id: pick.record.id, raw_excerpt_file: pick.location.raw_excerpt, raw_fields: pick.record.raw ?? null },
    retrieved_at: null, catalog_version: archive.version,
    notes: ['Archivfund: nicht das aktuelle Wetter am gewählten Ort.'],
  };
}

async function drawWithReplacement({ seed, label, items, verify, log, kind }) {
  let pool = items.slice();
  const draws = [];
  for (let i = 0; i <= 5 && pool.length; i++) {
    const lab = i === 0 ? label : `${label}#ersatz${i}`;
    const d = await uniformIndex(seed, lab, pool.length);
    const item = pool[d.index];
    draws.push({ label: lab, n: d.n, index: d.index, counter: d.counter, id: item.id });
    const problem = verify ? await verify(item) : null;
    if (!problem) return { item, draws };
    log.push({ step: `${kind}.verify`, outcome: 'beschädigt – ersetzt', id: item.id, reason: problem });
    pool = pool.filter((x) => x.id !== item.id);
  }
  throw new Error(`Kein gültiger ${kind}-Eintrag nach Ersatzversuchen.`);
}

export async function runConstellation(input, deps) {
  // Der Zeitpunkt wird genau einmal erfasst – vor jeder Netz- oder Dateioperation.
  const queryTime = deps.now().toISOString();
  const log = [{ step: 'time.capture', outcome: 'ok', query_time_utc: queryTime, time_source: deps.timeSource }];
  const normalizedName = normalizeName(input.name);
  const c = normalizeCoords(input.lat, input.lon);

  const manifests = {
    exoplanets: await deps.loadCatalog('exoplanets'),
    images: await deps.loadCatalog('images'),
    texts: await deps.loadCatalog('texts'),
  };
  const s0 = await computeS0({ normalizedName, lat6: c.lat6, lon6: c.lon6, queryTimeUtc: queryTime });

  // Stufe A – Wetter und Astronomie (unabhängig voneinander; Reihenfolge ohne Einfluss auf das Ergebnis)
  const [weather, astroDraw] = await Promise.all([
    obtainWeather({ lat: c.lat, lon: c.lon, queryTime, deps, log }),
    uniformIndex(s0.hex, 'astro', manifests.exoplanets.items.length),
  ]);
  const astroItem = manifests.exoplanets.items[astroDraw.index];
  const astroForSeed = { catalog: 'NASA Exoplanet Archive pscomppars', id: astroItem.id, record: astroItem.record };
  const wSeed = weatherForSeed(weather);

  // Stufe B – S1 aus S0 und den tatsächlich verwendeten wissenschaftlichen Daten
  const s1 = await computeS1({ s0: s0.hex, weatherForSeed: wSeed, astroForSeed });

  // Stufe B, kulturelle Funde: standardmässig «online zuerst» (grosse offene Datenbanken), der lokale Bestand ist Rückfall.
  // Bild und Werk werden unabhängig voneinander gezogen und fallen unabhängig zurück.
  const onlineWanted = input.online_first !== false && input.online_first !== 0;
  const onlineDeps = typeof deps.online === 'function' ? deps.online(input) : deps.online;
  const online = { image: null, text: null };
  let img = null; let work = null; let passagesDoc = null;
  const tryOnline = async (kind) => {
    const fn = onlineDeps?.[kind];
    if (!onlineWanted) { log.push({ step: `${kind}.online`, outcome: 'nicht gewünscht – Bestand' }); return null; }
    if (!fn) { log.push({ step: `${kind}.online`, outcome: 'nicht verfügbar in dieser Betriebsart – Bestand' }); return null; }
    const t0 = deps.monotonic();
    try {
      const r = await fn(s1.hex, log);
      online[kind] = { ...r.online, outcome: 'ok', duration_ms: Math.round(deps.monotonic() - t0) };
      log.push({ step: `${kind}.online`, outcome: 'ok', id: r.item.id, provider: r.item.provider, tries: r.online.draws.length, total: r.online.total, duration_ms: online[kind].duration_ms });
      return r;
    } catch (e) {
      online[kind] = { outcome: 'fehlgeschlagen – Rückfall auf Bestand', error: String(e.message || e), draws: e.draws || [], spaces: e.spaces || [], duration_ms: Math.round(deps.monotonic() - t0) };
      log.push({ step: `${kind}.online`, outcome: 'fehlgeschlagen – Rückfall auf Bestand', error: String(e.message || e), tries: (e.draws || []).length, duration_ms: online[kind].duration_ms });
      return null;
    }
  };
  const [oi, ot] = await Promise.all([tryOnline('image'), tryOnline('text')]);
  if (oi) img = { item: oi.item, draws: oi.online.draws.map(({ outcome, duration_ms, ...d }) => d) };
  if (ot) { const { passages_doc, ...item } = ot.item; passagesDoc = passages_doc; work = { item, draws: ot.online.draws.map(({ outcome, duration_ms, ...d }) => d) }; }
  if (!img) img = await drawWithReplacement({ seed: s1.hex, label: 'image', items: manifests.images.items, verify: deps.verifyImage, log, kind: 'image' });
  if (!work) work = await drawWithReplacement({
    seed: s1.hex, label: 'text-work', items: manifests.texts.items, log, kind: 'text-work',
    verify: async (w) => { try { passagesDoc = await deps.loadPassages(w); return null; } catch (e) { return String(e.message || e); } },
  });
  const passages = passagesDoc.passages;
  const pDraw = await uniformIndex(s1.hex, 'text-passage', passages.length);
  const passage = passages[pDraw.index];

  const record = {
    schema: 'konstellation-record/1',
    id: `${queryTime.replace(/[-:.]/g, '').replace('T', '-').slice(0, 18)}-${s1.hex.slice(0, 8)}`,
    algorithm_version: ALGORITHM_VERSION,
    mode: deps.mode,
    time: { query_time_utc: queryTime, time_source: deps.timeSource, note: 'Abfragezeitpunkt: einmal beim Auslösen erfasst. Datenzeitpunkt und Abrufzeitpunkt stehen getrennt bei den Funden.' },
    input: {
      display_name: input.name, normalized_name: normalizedName, name_normalization: 'Unicode NFC; Leerraum zusammengefasst; aussen gekürzt',
      lat: c.lat, lon: c.lon, lat6: c.lat6, lon6: c.lon6, place_label: input.place_label || null, place_label_source: input.place_label_source || null,
      coordinate_note: 'Die Koordinaten sind die verbindliche Eingabe; der Ortsname ist nur Beschriftung.',
      online_first: onlineWanted, text_languages: onlineDeps?.languages ?? null,
    },
    seeds: {
      S0: { hex: s0.hex, canonical_input: s0.canonical },
      S1: { hex: s1.hex, canonical_input: s1.canonical },
      draws: { astro: astroDraw, image: img.draws, image_source: img.item.source_mode || 'local', text_work: work.draws, text_source: work.item.source_mode || 'local', text_passage: { ...pDraw, n_passages: passages.length } },
    },
    science: {
      weather: {
        level: weather.level, level_label: weather.level_label, source: weather.source, data_kind: weather.data_kind,
        data_time_utc: weather.data_time_utc, retrieved_at: weather.retrieved_at ?? null,
        requested: { lat: c.lat, lon: c.lon }, provided: weather.provided, distance_km: weather.distance_km ?? null,
        values: weather.values, notes: weather.notes || [], source_url: weather.source_url || null,
        raw: weather.raw ?? null, used_for_seed: wSeed,
      },
      astro: {
        id: astroItem.id, catalog: 'NASA Exoplanet Archive – Planetary Systems Composite Parameters (pscomppars)',
        record: astroItem.record, units: manifests.exoplanets.units,
        source_url: `https://exoplanetarchive.ipac.caltech.edu/overview/${encodeURIComponent(astroItem.record.hostname || astroItem.id)}`,
        catalog_retrieved_at: manifests.exoplanets.source?.retrieved_at ?? null,
        note: 'Katalogauswahl. Keine Aussage über Sichtbarkeit am gewählten Ort oder Zeitpunkt.',
        used_for_seed: astroForSeed,
      },
    },
    culture: {
      image: { source_mode: 'local', ...img.item },
      image_online: online.image,
      text: {
        work: { source_mode: 'local', ...work.item },
        passage: { n: passage.n, text: passage.text, words: passage.words, form: passage.form || 'prosa', chapter: passage.chapter, heads: passage.heads, p_from: passage.p_from, p_to: passage.p_to, part: passage.part, sha256: await sha256Hex(passage.text) },
        passage_rule: passagesDoc.rule, passage_stats: passagesDoc.excluded ? { excluded: passagesDoc.excluded, paragraphs: passagesDoc.paragraphs ?? null } : null,
      },
      text_online: online.text,
    },
    catalogs: Object.fromEntries(Object.entries(manifests).map(([k, m]) => [k, { version: m.version, item_count: m.items.length }])),
    rules: RULES,
    technical_log: log,
    privacy: 'Der Name wird nicht an Datenanbieter gesendet. An Open-Meteo gehen nur Koordinaten.',
  };
  if (weather.level === 'archive') record.catalogs['weather-archive'] = { version: weather.catalog_version };
  return record;
}

// Rechnet S0, S1 und alle Ziehungen aus einem gespeicherten Protokoll und den aktuell geladenen Beständen nach.
export async function verifyRecord(record, deps) {
  const issues = []; const notes = [];
  const s0 = await computeS0({ normalizedName: record.input.normalized_name, lat6: record.input.lat6, lon6: record.input.lon6, queryTimeUtc: record.time.query_time_utc });
  if (s0.hex !== record.seeds.S0.hex) issues.push('S0 weicht ab');
  const s1 = await computeS1({ s0: s0.hex, weatherForSeed: record.science.weather.used_for_seed, astroForSeed: record.science.astro.used_for_seed });
  if (s1.hex !== record.seeds.S1.hex) issues.push('S1 weicht ab');
  for (const k of ['exoplanets', 'images', 'texts']) {
    const m = await deps.loadCatalog(k);
    if (m.version !== record.catalogs[k].version) { issues.push(`Bestand ${k}: Version ${m.version.slice(0, 12)} ≠ ${record.catalogs[k].version.slice(0, 12)} – Neuauswahl nicht prüfbar`); continue; }
    if (k === 'exoplanets') { const d = await uniformIndex(s0.hex, 'astro', m.items.length); if (m.items[d.index].id !== record.science.astro.id) issues.push('Astronomie-Ziehung weicht ab'); }
    if (k === 'images' && record.seeds.draws.image_source === 'online') { notes.push('Bild online gezogen (' + record.culture.image.provider + '): über ID/URL/Prüfsumme im Protokoll wiederholbar, gegen einen späteren Datenbankstand nicht neu berechenbar'); continue; }
    if (k === 'texts' && record.seeds.draws.text_source === 'online') { notes.push('Text online gezogen (' + record.culture.text.work.provider + '): über ID/URL im Protokoll wiederholbar, gegen einen späteren Datenbankstand nicht neu berechenbar'); continue; }
    if (k === 'images') { const last = record.seeds.draws.image.at(-1); if (last.id !== record.culture.image.id) issues.push('Bild-Ziehung inkonsistent'); const d = await uniformIndex(s1.hex, 'image', m.items.length); if (m.items[d.index].id !== record.seeds.draws.image[0].id) issues.push('Bild-Ziehung weicht ab'); }
    if (k === 'texts') { const d = await uniformIndex(s1.hex, 'text-work', m.items.length); if (m.items[d.index].id !== record.seeds.draws.text_work[0].id) issues.push('Werk-Ziehung weicht ab'); }
  }
  return { ok: issues.length === 0, issues, notes, s0: s0.hex, s1: s1.hex };
}
