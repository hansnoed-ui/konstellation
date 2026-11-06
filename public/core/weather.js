// Normalisierte Wetterdarstellung. Fehlende Werte sind null – niemals 0.
// Einheiten werden immer mitgeführt.
export const WEATHER_FIELDS = {
  temperature_2m: { label: 'Lufttemperatur (2 m)', unit: '°C' },
  wind_speed_10m: { label: 'Windgeschwindigkeit (10 m)', unit: 'km/h' },
  wind_direction_10m: { label: 'Windrichtung (10 m, woher)', unit: '°' },
  pressure_msl: { label: 'Luftdruck auf Meereshöhe', unit: 'hPa' },
  cloud_cover: { label: 'Bewölkung', unit: '%' },
  precipitation: { label: 'Niederschlag', unit: 'mm' },
};
export const OM_CURRENT_VARS = Object.keys(WEATHER_FIELDS).join(',');

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371.0088; const r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r; const dLon = (lon2 - lon1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Open-Meteo «current»-Block -> normalisiert. Die API liefert Zeit ohne Zone, bei timezone=GMT ist das UTC.
export function normalizeOpenMeteoCurrent(json) {
  const c = json?.current; const u = json?.current_units || {};
  if (!c || typeof c.time !== 'string') throw new Error('Unerwartete Antwort: kein current.time');
  if (json.utc_offset_seconds !== 0) throw new Error('Unerwartete Zeitzone: ' + json.utc_offset_seconds);
  const values = {};
  for (const [k, f] of Object.entries(WEATHER_FIELDS)) {
    if (u[k] !== undefined && u[k] !== f.unit) throw new Error(`Einheit ${k}: erwartet ${f.unit}, erhalten ${u[k]}`);
    values[k] = { value: num(c[k]), unit: f.unit };
  }
  if (Object.values(values).every((v) => v.value === null)) throw new Error('Antwort ohne einen einzigen Messwert');
  return {
    data_time_utc: new Date(c.time + 'Z').toISOString(),
    interval_seconds: num(c.interval),
    provided: { lat: num(json.latitude), lon: num(json.longitude), elevation_m: num(json.elevation), kind: 'Rasterzelle des Wettermodells' },
    values,
    notes: ['Niederschlag: Summe des vorangehenden Intervalls (interval_seconds).'],
  };
}

// Archivregel (Version weather-archive/1):
//  1. Ort: der Archivort mit der kleinsten Grosskreisdistanz zu den gewählten Koordinaten.
//  2. Zeitpunkt innerhalb dieses Ortes: kleinste zyklische Differenz im Tag des Jahres zum Abfragezeitpunkt,
//     danach kleinste zyklische Differenz der UTC-Stunde, danach der jüngste Datensatz, danach die kleinere id.
export const ARCHIVE_RULE = 'weather-archive/1';
function doy(d) { const s = Date.UTC(d.getUTCFullYear(), 0, 1); return Math.floor((d - s) / 86400000); }
const cyc = (a, b, n) => { const x = Math.abs(a - b) % n; return Math.min(x, n - x); };

export function pickFromArchive(archive, lat, lon, queryIso) {
  if (!archive?.items?.length) return null;
  let best = null;
  for (const loc of archive.items) {
    const d = haversineKm(lat, lon, loc.lat, loc.lon);
    if (!best || d < best.d || (d === best.d && loc.id < best.loc.id)) best = { loc, d };
  }
  const q = new Date(queryIso);
  const recs = best.loc.records.slice().sort((a, b) => {
    const ta = new Date(a.data_time_utc), tb = new Date(b.data_time_utc);
    return cyc(doy(ta), doy(q), 365) - cyc(doy(tb), doy(q), 365)
      || cyc(ta.getUTCHours(), q.getUTCHours(), 24) - cyc(tb.getUTCHours(), q.getUTCHours(), 24)
      || tb - ta || (a.id < b.id ? -1 : 1);
  });
  return { location: best.loc, distance_km: Math.round(best.d * 10) / 10, record: recs[0] };
}
