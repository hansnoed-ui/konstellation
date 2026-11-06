// Import: einfache Weltkarte und Ortsliste aus Natural Earth (gemeinfrei, https://www.naturalearthdata.com/about/terms-of-use/),
// bezogen über den offiziellen GitHub-Spiegel nvkelso/natural-earth-vector. Koordinaten werden auf 3 Nachkommastellen
// gerundet (≈100 m, für eine Übersichtskarte 1:110 Mio. ohne sichtbaren Unterschied), um die Datei klein zu halten.
import path from 'node:path';
import { CATALOG, fetchBuf, sha256, writeAtomic, log } from './lib.js';

const BASE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';
const DIR = path.join(CATALOG, 'basemap');
const round = (c) => (Array.isArray(c[0]) ? c.map(round) : [Math.round(c[0] * 1000) / 1000, Math.round(c[1] * 1000) / 1000]);

async function main() {
  const out = { sources: [] };
  {
    const url = `${BASE}/ne_110m_admin_0_countries.geojson`;
    const { buf } = await fetchBuf(url, { timeoutMs: 60000 });
    const gj = JSON.parse(buf.toString('utf8'));
    const slim = { type: 'FeatureCollection', features: gj.features.map((f) => ({ type: 'Feature', properties: { name: f.properties.NAME_DE || f.properties.NAME, iso: f.properties.ISO_A2 }, geometry: { type: f.geometry.type, coordinates: round(f.geometry.coordinates) } })) };
    const text = JSON.stringify(slim);
    writeAtomic(path.join(DIR, 'countries-110m.geojson'), text);
    out.sources.push({ file: 'countries-110m.geojson', url, upstream_sha256: sha256(buf), sha256: sha256(Buffer.from(text)), features: slim.features.length });
  }
  {
    const url = `${BASE}/ne_10m_populated_places_simple.geojson`;
    const { buf } = await fetchBuf(url, { timeoutMs: 120000 });
    const gj = JSON.parse(buf.toString('utf8'));
    // Ortsliste: Hauptstädte und Orte mit Bedeutungsrang ≤ 3 (scalerank), weltweit
    const places = gj.features
      .filter((f) => f.properties.scalerank <= 3 || f.properties.featurecla?.includes('capital'))
      .map((f) => ({ name: f.properties.name, country: f.properties.adm0name, region: f.properties.adm1name || null, lat: Math.round(f.properties.latitude * 1e4) / 1e4, lon: Math.round(f.properties.longitude * 1e4) / 1e4, pop: f.properties.pop_max || null }))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
    const text = JSON.stringify(places);
    writeAtomic(path.join(DIR, 'places.json'), text);
    out.sources.push({ file: 'places.json', url, upstream_sha256: sha256(buf), sha256: sha256(Buffer.from(text)), count: places.length });
  }
  out.rights = 'Natural Earth – gemeinfrei (public domain). «Made with Natural Earth.»';
  out.generated_at = new Date().toISOString();
  writeAtomic(path.join(DIR, 'manifest.json'), JSON.stringify(out, null, 1));
  log('Basiskarte', JSON.stringify(out.sources.map((s) => [s.file, s.features || s.count])));
}
main().catch((e) => { console.error(e); process.exit(1); });
