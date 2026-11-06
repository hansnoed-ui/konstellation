// Astronomische Archive für die Online-Ziehung in Stufe A (Index aus S0, Strom «astro-online»):
//  - exoplanets-live: NASA Exoplanet Archive, Tabelle pscomppars über TAP (Namensliste sortiert, dann die Zeile des gezogenen Planeten)
//  - gaia: Gaia DR3 (ESA-Archiv, TAP): Auswahlraum = random_index 0 … max (1 811 709 770), exakt adressierbar
//  - sbdb: JPL Small-Body Database: Auswahlraum = nummerierte Kleinkörper 1 … Anzahl (sbdb_query count), Abruf über sbdb.api
// Keines der drei Archive sendet CORS-Kopfzeilen: im Browser laufen die Abfragen über den Durchreicher proxy.php (Option rewrite).
// Jeder Anbieter liefert { id, kind, record, units, catalog, source_url, rights } – record geht in S1 ein (used_for_seed).
import { fetchWithTimeout } from '../openmeteo.js';
import { Reject } from '../online.js';

export const NASA_TAP = 'https://exoplanetarchive.ipac.caltech.edu/TAP/sync';
export const GAIA_TAP = 'https://gea.esac.esa.int/tap-server/tap/sync';
export const SBDB_API = 'https://ssd-api.jpl.nasa.gov';
const PL_COLUMNS = ['pl_name', 'hostname', 'sy_snum', 'sy_pnum', 'discoverymethod', 'disc_year', 'disc_facility', 'pl_orbper', 'pl_orbsmax', 'pl_rade', 'pl_bmasse', 'pl_bmassprov', 'pl_orbeccen', 'pl_eqt', 'st_spectype', 'st_teff', 'st_mass', 'st_rad', 'sy_dist', 'ra', 'dec', 'rastr', 'decstr', 'sy_vmag', 'pl_pubdate'];
export const PL_UNITS = { pl_orbper: 'Tage', pl_orbsmax: 'AE', pl_rade: 'Erdradien', pl_bmasse: 'Erdmassen', pl_eqt: 'K', st_teff: 'K', st_mass: 'Sonnenmassen', st_rad: 'Sonnenradien', sy_dist: 'pc', ra: 'Grad', dec: 'Grad', sy_vmag: 'mag' };
const NASA_RIGHTS = 'Daten des NASA Exoplanet Archive (Caltech/IPAC, NASA Exoplanet Exploration Program); Nutzung mit Danksagung.';
const num = (v) => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : v);

export function exoplanetsLiveProvider({ tap = NASA_TAP, maxAgeMs = 3600e3, rewrite = (u) => u } = {}) {
  let cache = null;
  return {
    id: 'exoplanets-live', name: 'NASA Exoplanet Archive, pscomppars (Live-Abfrage über TAP)',
    async space(ctx) {
      if (cache && ctx.nowMs() - cache.at < maxAgeMs) return { total: cache.names.length, retrieved_at: cache.retrieved_at, note: 'alle Planeten, nach pl_name sortiert' };
      const r = await fetchWithTimeout(ctx.fetchImpl, rewrite(`${tap}?query=${encodeURIComponent('select pl_name from pscomppars order by pl_name')}&format=json`), Math.min(ctx.left(), 8000), ctx.headers);
      if (!r.ok) throw new Error(`Namensliste: HTTP ${r.status}`);
      const names = (await r.json()).map((x) => x.pl_name).filter(Boolean).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      if (names.length < 100) throw new Error('Namensliste unerwartet kurz');
      cache = { names, retrieved_at: new Date(ctx.nowMs()).toISOString(), at: ctx.nowMs() };
      return { total: names.length, retrieved_at: cache.retrieved_at, note: 'alle Planeten, nach pl_name sortiert (UTF-16)' };
    },
    async resolve(index, ctx) {
      const name = cache.names[index]; const sid = name;
      const q = `select ${PL_COLUMNS.join(',')} from pscomppars where pl_name = '${name.replace(/'/g, "''")}'`;
      const r = await fetchWithTimeout(ctx.fetchImpl, rewrite(`${tap}?query=${encodeURIComponent(q)}&format=json`), Math.min(ctx.left(), 8000), ctx.headers);
      if (!r.ok) throw new Reject(`HTTP ${r.status}`, { id: sid });
      const row = (await r.json())[0]; if (!row) throw new Reject('Planet nicht gefunden', { id: sid });
      const record = Object.fromEntries(PL_COLUMNS.map((c) => [c, num(row[c])]));
      return { id: sid, kind: 'exoplanet', provider: 'exoplanets-live', source_mode: 'online', record, units: PL_UNITS, catalog: 'NASA Exoplanet Archive – pscomppars (Live-Abfrage)', source_url: `https://exoplanetarchive.ipac.caltech.edu/overview/${encodeURIComponent(record.hostname || name)}`, rights: NASA_RIGHTS, retrieved_at: new Date(ctx.nowMs()).toISOString(), raw: row };
    },
  };
}

const GAIA_COLS = 'source_id,random_index,ra,dec,parallax,parallax_error,pmra,pmdec,phot_g_mean_mag,phot_bp_mean_mag,phot_rp_mean_mag,bp_rp,radial_velocity,teff_gspphot,logg_gspphot,distance_gspphot,ruwe,phot_variable_flag,non_single_star,in_qso_candidates,in_galaxy_candidates';
export const GAIA_UNITS = { ra: 'Grad', dec: 'Grad', parallax: 'mas', parallax_error: 'mas', pmra: 'mas/Jahr', pmdec: 'mas/Jahr', phot_g_mean_mag: 'mag', phot_bp_mean_mag: 'mag', phot_rp_mean_mag: 'mag', bp_rp: 'mag', radial_velocity: 'km/s', teff_gspphot: 'K', logg_gspphot: 'log(cm/s²)', distance_gspphot: 'pc' };
// Gaia DR3 ist eine eingefrorene Datenveröffentlichung (13. 6. 2022): 1 811 709 771 Quellen, random_index 0 … 1 811 709 770
// (am 6. 11. 2026 live mit max(random_index) bestätigt). Die Zahl wird nicht je Ablauf abgefragt – der Scan über 1,8 Mrd. Zeilen
// wäre eine unnötige Last für das Archiv.
export const GAIA_DR3_TOTAL = 1811709771; export const GAIA_DR3_RELEASED = '2022-06-13T00:00:00.000Z';
export function gaiaProvider({ tap = GAIA_TAP, total = GAIA_DR3_TOTAL, rewrite = (u) => u } = {}) {
  return {
    id: 'gaia', name: 'Gaia DR3 (ESA Gaia Archive, TAP)',
    async space() {
      return { total, retrieved_at: GAIA_DR3_RELEASED, note: 'alle Quellen in gaiadr3.gaia_source (eingefrorene Veröffentlichung); random_index ist eine Permutation 0 … total−1' };
    },
    async resolve(index, ctx) {
      const r = await fetchWithTimeout(ctx.fetchImpl, rewrite(`${tap}?REQUEST=doQuery&LANG=ADQL&FORMAT=json&QUERY=${encodeURIComponent(`select ${GAIA_COLS} from gaiadr3.gaia_source where random_index = ${index}`)}`), Math.min(ctx.left(), 10000), ctx.headers);
      if (!r.ok) throw new Reject(`HTTP ${r.status}`, { id: `gaia-#${index}` });
      const j = await r.json(); const row = j.data?.[0]; if (!row) throw new Reject('keine Quelle mit diesem random_index', { id: `gaia-#${index}` });
      const cols = j.metadata.map((c) => c.name); const record = Object.fromEntries(cols.map((c, i) => [c, row[i] === null ? null : typeof row[i] === 'number' ? row[i] : String(row[i])]));
      record.source_id = String(record.source_id);
      const sid = `Gaia DR3 ${record.source_id}`;
      return { id: sid, kind: 'star', provider: 'gaia', source_mode: 'online', record, units: GAIA_UNITS, catalog: 'Gaia DR3 gaia_source (ESA Gaia Archive, Live-Abfrage)', source_url: `https://gea.esac.esa.int/archive/`, rights: 'ESA/Gaia/DPAC; Nutzung mit Danksagung (Gaia Collaboration et al. 2016, 2023).', retrieved_at: new Date(ctx.nowMs()).toISOString(), raw: j };
    },
  };
}

export const SBDB_UNITS = { a: 'AE', q: 'AE', e: '', i: 'Grad', per_y: 'Jahre', diameter: 'km', H: 'mag', albedo: '', rot_per: 'h' };
export function sbdbProvider({ api = SBDB_API, maxAgeMs = 24 * 3600e3, rewrite = (u) => u } = {}) {
  let cache = null;
  return {
    id: 'sbdb', name: 'JPL Small-Body Database (nummerierte Kleinkörper)',
    async space(ctx) {
      if (cache && ctx.nowMs() - cache.at < maxAgeMs) return { total: cache.total, retrieved_at: cache.retrieved_at, note: 'Nummern 1 … Anzahl' };
      const r = await fetchWithTimeout(ctx.fetchImpl, rewrite(`${api}/sbdb_query.api?fields=spkid&sb-ns=n&limit=1`), Math.min(ctx.left(), 8000), ctx.headers);
      if (!r.ok) throw new Error(`Anzahl: HTTP ${r.status}`);
      const n = Number((await r.json()).count); if (!(n > 0)) throw new Error('Anzahl unerwartet');
      cache = { total: n, retrieved_at: new Date(ctx.nowMs()).toISOString(), at: ctx.nowMs() };
      return { total: n, retrieved_at: cache.retrieved_at, note: 'nummerierte Kleinkörper (Asteroiden und Kometen), Nummer = Index + 1' };
    },
    async resolve(index, ctx) {
      const n = index + 1;
      const r = await fetchWithTimeout(ctx.fetchImpl, rewrite(`${api}/sbdb.api?sstr=${n}&phys-par=1&discovery=1`), Math.min(ctx.left(), 8000), ctx.headers);
      if (!r.ok) throw new Reject(`HTTP ${r.status}`, { id: `sbdb-${n}` });
      const j = await r.json(); if (!j.object) throw new Reject(j.message || 'Objekt nicht gefunden', { id: `sbdb-${n}` });
      const el = Object.fromEntries((j.orbit?.elements || []).map((e) => [e.name, num(e.value)]));
      const ph = Object.fromEntries((j.phys_par || []).map((p) => [p.name, num(p.value)]));
      const record = {
        number: n, full_name: j.object.fullname, designation: j.object.des, kind: j.object.kind, orbit_class: j.object.orbit_class?.name ?? null, neo: j.object.neo ?? null, pha: j.object.pha ?? null,
        a: el.a ?? null, e: el.e ?? null, i: el.i ?? null, q: el.q ?? null, per_y: el.per !== undefined && el.per !== null ? Number((el.per / 365.25).toFixed(4)) : null, epoch_jd: num(j.orbit?.epoch),
        diameter: ph.diameter ?? null, H: ph.H ?? null, albedo: ph.albedo ?? null, rot_per: ph.rot_per ?? null, spec_T: ph.spec_T ?? null,
        discovery_date: j.discovery?.date ?? null, discovery_site: j.discovery?.location ?? null, discoverer: j.discovery?.who ?? null, name_citation: j.discovery?.cref ? String(j.discovery.cref).slice(0, 400) : null,
      };
      return { id: j.object.fullname, kind: 'small-body', provider: 'sbdb', source_mode: 'online', record, units: SBDB_UNITS, catalog: 'JPL Small-Body Database (Live-Abfrage)', source_url: `https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=${n}`, rights: 'NASA/JPL Solar System Dynamics; US Government Work, Nutzung mit Quellenangabe.', retrieved_at: new Date(ctx.nowMs()).toISOString(), raw: j };
    },
  };
}
