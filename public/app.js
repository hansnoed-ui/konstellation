// Oberfläche. Zwei Betriebsarten:
//  - Server: /api/* vorhanden (lokaler Node-Server), Speicherung auf der Festplatte des Servers.
//  - Statisch: kein /api, der Ablauf läuft im Browser (public/core), Speicherung im Browser.
import { runConstellation } from './core/pipeline.js';
import { geocodeOpenMeteo, searchLocalPlaces } from './core/openmeteo.js';
import { buildPackage } from './core/package.js';
import { makeBrowserDeps, LS } from './browser-deps.js';
import { WEATHER_FIELDS } from './core/weather.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const state = { mode: null, cfg: null, places: null, names: null, marker: null, map: null, label: null, labelSource: null, record: null, deps: null, results: [] };

async function detectMode() {
  try {
    const r = await fetch('api/config', { cache: 'no-store' });
    if (r.ok) { const j = await r.json(); if (j.mode === 'server') return { mode: 'server', cfg: j }; }
  } catch {}
  const offline = new URLSearchParams(location.search).has('offline');
  return { mode: 'static', cfg: { map: { tiles: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', tilesAttribution: '© OpenStreetMap-Mitwirkende', tilesEnabled: !offline }, geocodingOnline: !offline, weatherLive: !offline } };
}

async function loadJson(url) { const r = await fetch(url, { cache: 'no-cache' }); if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`); return r.json(); }

function initMap() {
  const map = L.map('karte', { worldCopyJump: true, minZoom: 1, keyboard: true }).setView([20, 0], 2);
  state.map = map;
  loadJson('catalog/basemap/countries-110m.geojson').then((gj) => {
    L.geoJSON(gj, { style: { color: '#6b7f8f', weight: .6, fillColor: '#cfd9c6', fillOpacity: .8 }, interactive: false }).addTo(map).bringToBack();
    map.attributionControl.addAttribution('Made with Natural Earth');
  }).catch(() => { $('karte-hinweis').textContent = 'Grundkarte nicht ladbar; Koordinateneingabe funktioniert weiterhin.'; });
  if (state.cfg.map.tilesEnabled) {
    let failed = 0;
    const tiles = L.tileLayer(state.cfg.map.tiles, { attribution: state.cfg.map.tilesAttribution, maxZoom: 18, crossOrigin: true });
    tiles.on('tileerror', () => { if (++failed === 6) { map.removeLayer(tiles); $('karte-hinweis').textContent = 'Kartenkacheln nicht erreichbar – einfache Weltkarte (Natural Earth).'; } });
    tiles.addTo(map);
    $('karte-hinweis').textContent = 'Klicken oder tippen setzt den Punkt; der Punkt lässt sich verschieben.';
  } else $('karte-hinweis').textContent = 'Offline: einfache Weltkarte (Natural Earth). Klicken setzt den Punkt.';
  map.on('click', (e) => setPoint(e.latlng.lat, e.latlng.lng, null, null, false));
  map.on('keypress', (e) => { if (e.originalEvent.key === 'Enter') { const c = map.getCenter(); setPoint(c.lat, c.lng, null, null, false); } });
  $('karte').setAttribute('aria-description', 'Pfeiltasten verschieben die Karte, Plus/Minus zoomen, Enter setzt den Punkt in der Kartenmitte.');
}

function setPoint(lat, lon, label, source, pan = true) {
  lat = Math.max(-90, Math.min(90, lat)); lon = ((((lon + 180) % 360) + 360) % 360) - 180;
  if (!state.marker) {
    state.marker = L.marker([lat, lon], { draggable: true, keyboard: true, title: 'Gewählter Punkt (verschiebbar)' }).addTo(state.map);
    state.marker.on('dragend', () => { const p = state.marker.getLatLng(); setPoint(p.lat, p.lng, null, null, false); });
  } else state.marker.setLatLng([lat, lon]);
  if (pan) state.map.setView([lat, lon], Math.max(state.map.getZoom(), 5));
  $('lat').value = lat.toFixed(6); $('lon').value = lon.toFixed(6);
  state.label = label; state.labelSource = source;
  $('ortslabel').textContent = label ? `Beschriftung: ${label} (${source})` : 'Kein Ortsname – die Koordinaten gelten.';
  $('fehler').textContent = '';
}

async function search() {
  const q = $('ortsuche').value.trim(); if (!q) return;
  const box = $('treffer'); box.innerHTML = '<li>Suche …</li>'; box.hidden = false; $('ortsuche').setAttribute('aria-expanded', 'true');
  let results = []; let source = ''; let note = '';
  if (state.mode === 'server') {
    try { const j = await loadJson('api/geocode?q=' + encodeURIComponent(q)); results = j.results; source = j.source; note = j.note || ''; } catch (e) { note = 'Suche fehlgeschlagen: ' + e.message; }
  } else {
    if (state.cfg.geocodingOnline) { try { results = await geocodeOpenMeteo(q); source = 'Open-Meteo'; } catch (e) { note = 'Online-Ortssuche nicht erreichbar: ' + e.message; } }
    if (!results.length) { if (!state.places) state.places = await loadJson('catalog/basemap/places.json'); results = searchLocalPlaces(state.places, q); source = 'lokal'; }
  }
  state.results = results;
  box.innerHTML = results.length ? results.map((r, i) => `<li role="option" tabindex="0" data-i="${i}" aria-selected="false">${esc(r.name)}${r.region ? ', ' + esc(r.region) : ''}${r.country ? ' – ' + esc(r.country) : ''} <small>(${r.lat.toFixed(3)}, ${r.lon.toFixed(3)})</small></li>`).join('') : '<li>Keine Treffer. Punkt auf der Karte setzen oder Koordinaten eingeben.</li>';
  $('ort-hinweis').textContent = (note ? note + ' ' : '') + (results.length ? `Quelle: ${source}. Bei mehreren Treffern Land/Region beachten.` : '');
}
function chooseResult(i) {
  const r = state.results[i]; if (!r) return;
  setPoint(r.lat, r.lon, [r.name, r.region, r.country].filter(Boolean).join(', '), r.source);
  $('treffer').hidden = true; $('ortsuche').setAttribute('aria-expanded', 'false');
  rememberPlace({ label: state.label, lat: r.lat, lon: r.lon, source: r.source });
}

function rememberPlace(p) {
  const list = LS.get('konstellation.orte', []).filter((x) => !(x.lat === p.lat && x.lon === p.lon));
  LS.set('konstellation.orte', [p, ...list].slice(0, 8)); renderRecent();
}
function renderRecent() {
  const list = LS.get('konstellation.orte', []);
  $('zuletzt-box').hidden = !list.length;
  $('zuletzt').innerHTML = list.map((p, i) => `<li><button type="button" data-i="${i}">${esc(p.label || `${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}`)}</button></li>`).join('');
  $('zuletzt').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { const p = list[b.dataset.i]; setPoint(p.lat, p.lon, p.label, p.source); }));
}

function randomName() {
  const pick = (a) => a[crypto.getRandomValues(new Uint32Array(1))[0] % a.length];
  return `${pick(state.names.given)} ${pick(state.names.family)}`;
}

function fmtTime(iso) { return new Date(iso).toLocaleString('de-CH', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'UTC' }) + ' UTC'; }
function fmtVal(v, unit) { return v === null || v === undefined ? 'fehlt' : `${Number(v).toLocaleString('de-CH')} ${unit}`; }

function render(r) {
  state.record = r;
  $('e-name').textContent = r.input.display_name;
  $('e-ort').textContent = (r.input.place_label ? r.input.place_label + ' · ' : '') + `${r.input.lat6}, ${r.input.lon6}`;
  $('e-zeit').textContent = fmtTime(r.time.query_time_utc); $('e-zeit').dateTime = r.time.query_time_utc;
  const w = r.science.weather;
  $('w-ebene').textContent = w.level === 'live' ? 'Aktueller Abruf' : w.level === 'cache' ? 'Aus dem Zwischenspeicher (früherer Abruf)' : `Archivfund – nicht das aktuelle Wetter am gewählten Ort`;
  $('w-werte').innerHTML = Object.entries(WEATHER_FIELDS).map(([k, f]) => `<dt>${esc(f.label)}</dt><dd>${esc(fmtVal(w.values[k]?.value, f.unit))}</dd>`).join('');
  $('w-meta').textContent = `${w.data_kind}. Datenzeitpunkt ${fmtTime(w.data_time_utc)}.` + (w.provided?.name ? ` Fundort ${w.provided.name} (${w.provided.lat}, ${w.provided.lon}), ${w.distance_km} km vom gewählten Ort.` : w.provided ? ` Gelieferte Rasterzelle ${w.provided.lat}, ${w.provided.lon}.` : '') + (w.retrieved_at ? ` Abgerufen ${fmtTime(w.retrieved_at)}.` : '');
  const a = r.science.astro; const rec = a.record; const u = a.units;
  $('a-name').textContent = a.id;
  const rows = [['Wirtsstern', rec.hostname], ['Entdeckung', rec.disc_year ? `${rec.disc_year} (${rec.discoverymethod || '?'}${rec.disc_facility ? ', ' + rec.disc_facility : ''})` : null], ['Umlaufzeit', rec.pl_orbper !== null ? fmtVal(rec.pl_orbper, u.pl_orbper) : 'fehlt'], ['Grosse Halbachse', fmtVal(rec.pl_orbsmax, u.pl_orbsmax)], ['Radius', fmtVal(rec.pl_rade, u.pl_rade)], ['Masse' + (rec.pl_bmassprov ? ` (${rec.pl_bmassprov})` : ''), fmtVal(rec.pl_bmasse, u.pl_bmasse)], ['Gleichgewichtstemperatur', fmtVal(rec.pl_eqt, u.pl_eqt)], ['Entfernung', fmtVal(rec.sy_dist, u.sy_dist)], ['Position (RA / Dec)', rec.rastr && rec.decstr ? `${rec.rastr} / ${rec.decstr}` : 'fehlt'], ['Spektraltyp Stern', rec.st_spectype || 'fehlt']];
  $('a-werte').innerHTML = rows.filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
  $('a-meta').innerHTML = `${esc(a.catalog)}, Katalogstand ${esc(fmtTime(a.catalog_retrieved_at))}. ${esc(a.note)} <a href="${esc(a.source_url)}" rel="noopener">Eintrag im Archiv</a>`;
  const b = r.culture.image;
  $('b-img').src = 'catalog/images/' + b.file; $('b-img').alt = `${b.artist || 'Unbekannt'}: ${b.title}`;
  $('b-cap').innerHTML = `${esc(b.artist || 'Unbekannt')}${b.artist_bio ? ' (' + esc(b.artist_bio) + ')' : ''}: <i>${esc(b.title)}</i>${b.date ? ', ' + esc(b.date) : ''}${b.medium ? '. ' + esc(b.medium) : ''}. ${esc(b.source_name)}${b.credit_line ? ' – ' + esc(b.credit_line) : ''}. ${esc(b.rights)}. <a href="${esc(b.source_url)}" rel="noopener">Quelle</a>`;
  const t = r.culture.text;
  $('t-text').textContent = t.passage.text;
  $('t-meta').innerHTML = `${esc(t.work.author)}: <i>${esc(t.work.title)}</i>${t.work.first_edition ? ' (' + esc(t.work.first_edition) + ')' : ''}. Stelle ${t.passage.n} von ${r.seeds.draws.text_passage.n_passages}, Kapitel ${t.passage.chapter}${t.passage.heads?.length ? ' («' + esc(t.passage.heads.join(' – ')) + '»)' : ''}, Absatz ${t.passage.p_from}${t.passage.p_to !== t.passage.p_from ? '–' + t.passage.p_to : ''}${t.passage.part ? ', Teil ' + esc(t.passage.part) : ''}. ${esc(t.work.rights)}. <a href="${esc(t.work.textgrid_url || t.work.source_url)}" rel="noopener">Quelle</a>`;
  $('verlauf').innerHTML = `
    <p><b>Zeit:</b> Abfragezeitpunkt ${esc(r.time.query_time_utc)} (${esc(r.time.time_source)}). Algorithmus ${esc(r.algorithm_version)}, Betriebsart ${esc(r.mode)}.</p>
    <p><b>S0</b> = SHA-256 von <code>${esc(r.seeds.S0.canonical_input)}</code><br>= <code>${r.seeds.S0.hex}</code></p>
    <p><b>Astronomie-Ziehung</b> aus S0: Index ${r.seeds.draws.astro.index} von ${r.seeds.draws.astro.n} (Strom «astro», Zähler ${r.seeds.draws.astro.counter}).</p>
    <p><b>S1</b> = SHA-256 von (S0, verwendeter Wetterdatensatz, verwendeter Katalogeintrag) = <code>${r.seeds.S1.hex}</code></p>
    <p><b>Bild:</b> ${r.seeds.draws.image.map((d) => `Index ${d.index} von ${d.n} (${esc(d.label)}) → ${esc(d.id)}`).join('; ')}.
       <b>Werk:</b> ${r.seeds.draws.text_work.map((d) => `Index ${d.index} von ${d.n} (${esc(d.label)}) → ${esc(d.id)}`).join('; ')}.
       <b>Stelle:</b> Index ${r.seeds.draws.text_passage.index} von ${r.seeds.draws.text_passage.n}.</p>
    <p><b>Wetter-Rückfallebene:</b> ${esc(w.level_label)}. Angefragt ${w.requested.lat}, ${w.requested.lon}; geliefert ${w.provided ? esc(w.provided.lat + ', ' + w.provided.lon + ' (' + (w.provided.kind || '') + ')') : '–'}.</p>
    <table><thead><tr><th>Schritt</th><th>Ergebnis</th><th>Details</th></tr></thead><tbody>${r.technical_log.map((l) => `<tr><td>${esc(l.step)}</td><td>${esc(l.outcome)}</td><td>${esc(Object.entries(l).filter(([k]) => !['step', 'outcome'].includes(k)).map(([k, v]) => `${k}: ${v}`).join(' · '))}</td></tr>`).join('')}</tbody></table>
    <p><b>Bestände:</b> ${Object.entries(r.catalogs).map(([k, c]) => `${esc(k)} ${c.version.slice(0, 12)}… (${c.item_count ?? ''})`).join(', ')}</p>
    <p><b>Bild:</b> ${esc(b.id)}, Datei ${esc(b.file)}, SHA-256 ${b.sha256}, abgerufen ${esc(b.retrieved_at)}, Rechte: ${esc(b.rights)}. <b>Text:</b> ${esc(t.work.id)}, ${esc(t.work.attribution)} Stellenregel ${esc(t.passage_rule)}.</p>
    <p>${esc(r.privacy)}</p>
    <details><summary>Vollständiges Protokoll (JSON)</summary><pre>${esc(JSON.stringify(r, null, 2))}</pre></details>`;
  $('ergebnis').hidden = false;
  $('ergebnis').scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('h-ergebnis').setAttribute('tabindex', '-1'); $('h-ergebnis').focus({ preventScroll: true });
}

async function generate(e) {
  e.preventDefault(); $('fehler').textContent = '';
  const name = $('name').value; const lat = Number($('lat').value); const lon = Number($('lon').value);
  if (!name.trim()) { $('fehler').textContent = 'Bitte einen Namen oder ein Pseudonym eingeben.'; $('name').focus(); return; }
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || $('lat').value === '') { $('fehler').textContent = 'Bitte einen Ort wählen (Karte, Suche oder Koordinaten).'; $('lat').focus(); return; }
  $('erzeugen').disabled = true; $('status').textContent = 'Wetter und Katalog werden abgefragt (höchstens einige Sekunden) …';
  const input = { name, lat, lon, place_label: state.label, place_label_source: state.labelSource };
  try {
    let record;
    if (state.mode === 'server') {
      const r = await fetch('api/constellations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`); record = j;
    } else {
      record = await runConstellation(input, state.deps);
      const all = LS.get('konstellation.gespeichert', []); all.unshift(record);
      if (!LS.set('konstellation.gespeichert', all.slice(0, 50))) $('gesp-hinweis').textContent = 'Speichern im Browser nicht möglich (Speicher voll oder gesperrt) – Export nutzen.';
    }
    rememberPlace({ label: state.label, lat, lon, source: state.labelSource });
    render(record); await listSaved();
  } catch (err) { $('fehler').textContent = 'Konstellation konnte nicht erzeugt werden: ' + err.message; }
  finally { $('erzeugen').disabled = false; $('status').textContent = ''; }
}

async function listSaved() {
  let list = [];
  if (state.mode === 'server') { try { list = await loadJson('api/constellations'); } catch {} }
  else list = LS.get('konstellation.gespeichert', []).map((r) => ({ id: r.id, name: r.input.display_name, place: r.input.place_label, lat: r.input.lat6, lon: r.input.lon6, time: r.time.query_time_utc }));
  $('gesp-hinweis').textContent = list.length ? (state.mode === 'server' ? 'Gespeichert auf dem lokalen Server (data/runtime/constellations). Öffnen löst keine neue Ziehung aus.' : 'Gespeichert in diesem Browser. Öffnen löst keine neue Ziehung aus.') : 'Noch keine gespeicherte Konstellation.';
  $('gesp-liste').innerHTML = list.map((x) => `<li><button type="button" data-id="${esc(x.id)}">Öffnen</button> <span>${esc(x.name)}</span> <span class="meta">${esc(x.place || `${x.lat}, ${x.lon}`)} · ${esc(fmtTime(x.time))}</span></li>`).join('');
  $('gesp-liste').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => openSaved(b.dataset.id)));
}
async function openSaved(id) {
  let r;
  if (state.mode === 'server') r = await loadJson('api/constellations/' + encodeURIComponent(id));
  else r = LS.get('konstellation.gespeichert', []).find((x) => x.id === id);
  if (r) render(r);
}
function download(name, data, type) {
  const url = URL.createObjectURL(new Blob([data], { type })); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
async function exportJson() { const r = state.record; if (!r) return; download(`konstellation-${r.id}.json`, JSON.stringify(r, null, 2), 'application/json'); }
async function exportZip() {
  const r = state.record; if (!r) return;
  if (state.mode === 'server') { location.href = `api/constellations/${encodeURIComponent(r.id)}/export.zip`; return; }
  const img = new Uint8Array(await (await fetch('catalog/images/' + r.culture.image.file)).arrayBuffer());
  download(`konstellation-${r.id}.zip`, buildPackage(r, img), 'application/zip');
}

async function main() {
  const d = await detectMode(); state.mode = d.mode; state.cfg = d.cfg;
  if (state.mode === 'static') state.deps = makeBrowserDeps({ weatherLive: state.cfg.weatherLive });
  $('modus').textContent = state.mode === 'server' ? 'Betriebsart: lokaler Server.' : 'Betriebsart: statisch, der Ablauf läuft in diesem Browser.';
  state.names = await loadJson('catalog/names/names.json');
  initMap(); renderRecent(); listSaved();
  $('zufallsname').addEventListener('click', () => { $('name').value = randomName(); $('name').focus(); });
  $('suchen').addEventListener('click', search);
  $('ortsuche').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } if (e.key === 'ArrowDown') { const f = $('treffer').querySelector('li[role=option]'); if (f) f.focus(); } });
  $('treffer').addEventListener('click', (e) => { const li = e.target.closest('li[data-i]'); if (li) chooseResult(Number(li.dataset.i)); });
  $('treffer').addEventListener('keydown', (e) => { const li = e.target.closest('li[data-i]'); if (!li) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); chooseResult(Number(li.dataset.i)); } if (e.key === 'ArrowDown' && li.nextElementSibling) li.nextElementSibling.focus(); if (e.key === 'ArrowUp') (li.previousElementSibling || $('ortsuche')).focus(); if (e.key === 'Escape') { $('treffer').hidden = true; $('ortsuche').focus(); } });
  $('koord-setzen').addEventListener('click', () => { const la = Number($('lat').value), lo = Number($('lon').value); if (!Number.isFinite(la) || !Number.isFinite(lo) || $('lat').value === '' || $('lon').value === '' || la < -90 || la > 90) { $('fehler').textContent = 'Koordinaten ungültig (Breite −90…90, Länge −180…180).'; return; } setPoint(la, lo, null, null); });
  $('form').addEventListener('submit', generate);
  $('neu').addEventListener('click', () => { $('ergebnis').hidden = true; state.record = null; $('name').focus(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  $('export-json').addEventListener('click', exportJson);
  $('export-zip').addEventListener('click', exportZip);
}
main().catch((e) => { $('fehler').textContent = 'Start fehlgeschlagen: ' + e.message; });
