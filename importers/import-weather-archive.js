// Import: Wetter-Archivbestand für den Offline-Rückfall.
//  A) NOAA Global Hourly / Integrated Surface Database (ISD), AWS Open Data (noaa-global-hourly-pds):
//     echte Stationsbeobachtungen (SYNOP, FM-12) an weltweit verteilten Flughafenstationen, je Station
//     vier Stichtage (15. Jan., 15. Apr., 15. Jul. 2025 und 15. Aug. 2025), alle Stunden.
//  B) Open-Meteo Forecast API mit past_days: modellierte Stundenwerte (Best-Match-Modelle) der vergangenen
//     Tage für Orte ohne Station, auch auf dem Meer. Nur Stunden vor dem Abrufzeitpunkt.
// Aufruf: npm run import:weather-archive
import path from 'node:path';
import { CATALOG, fetchBuf, fetchJson, sha256, writeAtomic, publishManifest, sleep, log } from './lib.js';
import { parseCsv } from './import-exoplanets.js';
import { WEATHER_FIELDS } from '../public/core/weather.js';

const DIR = path.join(CATALOG, 'weather-archive');
const ISD = [
  ['06670099999', 'Zürich-Kloten (LSZH)'], ['63740099999', 'Nairobi JKIA (HKJK)'], ['68816099999', 'Kapstadt (FACT)'],
  ['47671099999', 'Tokio Haneda (RJTT)'], ['94767099999', 'Sydney (YSSY)'], ['91182022521', 'Honolulu (PHNL)'],
  ['48698099999', 'Singapur Changi (WSSS)'], ['87576099999', 'Buenos Aires Ezeiza (SAEZ)'], ['43003099999', 'Mumbai (VABB)'],
];
const ISD_DAYS = ['2025-01-15', '2025-04-15', '2025-07-15', '2025-08-15'];
const OM_POINTS = [
  ['Reykjavík', 64.1466, -21.9426], ['Nuuk', 64.1814, -51.6941], ['Tromsø', 69.6496, 18.956], ['Lissabon', 38.7223, -9.1393],
  ['Kairo', 30.0444, 31.2357], ['Lagos', 6.5244, 3.3792], ['Moskau', 55.7558, 37.6173], ['Ulaanbaatar', 47.8864, 106.9057],
  ['Jakarta', -6.2088, 106.8456], ['Auckland', -36.8485, 174.7633], ['Anchorage', 61.2181, -149.9003], ['Mexiko-Stadt', 19.4326, -99.1332],
  ['New York', 40.7128, -74.006], ['Lima', -12.0464, -77.0428], ['Ushuaia', -54.8019, -68.303], ['Mittelatlantik (Meer)', 0.0, -30.0],
  ['Nordpazifik (Meer)', 30.0, -150.0], ['Südlicher Indischer Ozean (Meer)', -30.0, 80.0], ['Bern', 46.948, 7.4474], ['Basel', 47.5596, 7.5886],
];

function isdVal(field, scale, missing) {
  if (!field) return null;
  const [v, q] = field.split(',');
  if (v === undefined || Number(v) === missing || ['2', '3', '6', '7'].includes(q)) return null; // verdächtig/fehlerhaft -> fehlend
  return Number(v) / scale;
}
function isdRecord(r, h) {
  const g = (k) => r[h.indexOf(k)] || '';
  const w = g('WND').split(',');
  const dir = w[0] === '999' || ['2', '3', '6', '7'].includes(w[1]) ? null : Number(w[0]);
  const spd = w[3] === '9999' || ['2', '3', '6', '7'].includes(w[4]) ? null : Math.round(Number(w[3]) / 10 * 3.6 * 10) / 10;
  const aa = g('AA1').split(',');
  const prec = aa.length >= 2 && aa[0] === '01' && aa[1] !== '9999' && !['2', '3', '6', '7'].includes(aa[3]) ? Number(aa[1]) / 10 : null;
  const gf = g('GF1').split(',');
  const okta = gf[0] && !['99', '09', '10', '9'].includes(gf[0]) ? Number(gf[0]) : null;
  return {
    values: {
      temperature_2m: { value: isdVal(g('TMP'), 10, 9999), unit: '°C' },
      wind_speed_10m: { value: spd, unit: 'km/h' },
      wind_direction_10m: { value: dir, unit: '°' },
      pressure_msl: { value: isdVal(g('SLP'), 10, 99999), unit: 'hPa' },
      cloud_cover: { value: okta === null || !Number.isFinite(okta) ? null : Math.round(okta / 8 * 100), unit: '%' },
      precipitation: { value: prec, unit: 'mm' },
    },
    raw: { WND: g('WND'), TMP: g('TMP'), SLP: g('SLP'), AA1: g('AA1'), GF1: g('GF1'), REPORT_TYPE: g('REPORT_TYPE') },
  };
}

async function main() {
  const fetchedAt = new Date().toISOString();
  const locations = []; const rawFiles = [];
  for (const [station, label] of ISD) {
    const url = `https://noaa-global-hourly-pds.s3.amazonaws.com/2025/${station}.csv`;
    try {
      const { buf } = await fetchBuf(url, { timeoutMs: 120000 });
      const rows = parseCsv(buf.toString('utf8')); const h = rows.shift();
      const sel = rows.filter((r) => r[h.indexOf('REPORT_TYPE')] === 'FM-12' && ISD_DAYS.includes(r[h.indexOf('DATE')].slice(0, 10)));
      if (!sel.length) throw new Error('keine FM-12-Datensätze an den Stichtagen');
      const excerpt = [h, ...sel].map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n') + '\n';
      const exRel = `raw/isd-${station}-2025-excerpt.csv`;
      writeAtomic(path.join(DIR, exRel), excerpt);
      rawFiles.push({ file: exRel, sha256: sha256(Buffer.from(excerpt)), full_file_url: url, full_file_sha256: sha256(buf) });
      const r0 = sel[0];
      locations.push({
        id: `isd-${station}`, name: label, lat: Number(r0[h.indexOf('LATITUDE')]), lon: Number(r0[h.indexOf('LONGITUDE')]),
        elevation_m: Number(r0[h.indexOf('ELEVATION')]), source: 'noaa-isd',
        data_kind: 'Stationsbeobachtung (NOAA ISD, SYNOP FM-12)', source_url: url, raw_excerpt: exRel,
        records: sel.map((r) => ({ id: `isd-${station}-${r[h.indexOf('DATE')]}`, data_time_utc: new Date(r[h.indexOf('DATE')] + 'Z').toISOString(), ...isdRecord(r, h) })),
      });
      log('ISD ok', station, label, sel.length);
    } catch (e) { log('ISD verworfen', station, e.message); }
  }
  const hourly = Object.keys(WEATHER_FIELDS).join(',');
  for (const [name, lat, lon] of OM_POINTS) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=${hourly}&past_days=3&forecast_days=1&timezone=GMT&cell_selection=nearest&wind_speed_unit=kmh`;
    try {
      await sleep(300);
      const { json, buf } = await fetchJson(url, { timeoutMs: 30000 });
      if (json.utc_offset_seconds !== 0) throw new Error('Zeitzone');
      for (const [k, f] of Object.entries(WEATHER_FIELDS)) if (json.hourly_units[k] !== f.unit) throw new Error('Einheit ' + k);
      const id = `om-${name.normalize('NFD').replace(/[^A-Za-z]/g, '').toLowerCase()}`;
      const rawRel = `raw/${id}-${fetchedAt.slice(0, 10)}.json`;
      writeAtomic(path.join(DIR, rawRel), buf);
      rawFiles.push({ file: rawRel, sha256: sha256(buf), url });
      const recs = [];
      json.hourly.time.forEach((t, i) => {
        const iso = new Date(t + 'Z').toISOString();
        if (iso >= fetchedAt) return; // nur Vergangenheit
        if (new Date(t + 'Z').getUTCHours() % 3 !== 0) return; // dreistündlich genügt für den Rückfall
        const values = {};
        for (const [k, f] of Object.entries(WEATHER_FIELDS)) { const v = json.hourly[k][i]; values[k] = { value: typeof v === 'number' ? v : null, unit: f.unit }; }
        recs.push({ id: `${id}-${iso}`, data_time_utc: iso, values });
      });
      locations.push({
        id, name, lat: json.latitude, lon: json.longitude, requested_lat: lat, requested_lon: lon, elevation_m: json.elevation,
        source: 'open-meteo-forecast', data_kind: 'Modelldaten (Open-Meteo, Best-Match-Wettermodelle, vergangene Stunden)', source_url: url,
        raw_excerpt: rawRel, records: recs,
      });
      log('Open-Meteo ok', name, recs.length);
    } catch (e) { log('Open-Meteo verworfen', name, e.message); }
  }
  const m = publishManifest('weather-archive', {
    catalog: 'weather-archive', schema: 1, generated_at: fetchedAt,
    rule: 'weather-archive/1: nächster Archivort (Grosskreisdistanz), dann kleinste zyklische Differenz im Tag des Jahres, dann der UTC-Stunde, dann jüngster Datensatz.',
    sources: [
      { name: 'NOAA Global Hourly – Integrated Surface Database (ISD)', url: 'https://registry.opendata.aws/noaa-isd/', rights: 'NOAA-Daten, U.S. Government Work, gemeinfrei in den USA; Quelle: NOAA National Centers for Environmental Information.' },
      { name: 'Open-Meteo Forecast API', url: 'https://open-meteo.com/en/docs', rights: 'Open-Meteo-Daten CC BY 4.0; API-Nutzung frei für nichtkommerzielle Zwecke (https://open-meteo.com/en/terms).' },
    ],
    raw_files: rawFiles,
    items: locations,
  });
  log(`Wetterarchiv: ${locations.length} Orte, ${locations.reduce((a, l) => a + l.records.length, 0)} Datensätze, Version ${m.version.slice(0, 12)}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
