// Adapter Open-Meteo (Wetter «current» und Ortssuche). Läuft in Node und im Browser (CORS erlaubt).
// Ein einfacher Schutzschalter überspringt den Anbieter nach 429 (bis Retry-After, mind. 60 s)
// oder nach 3 aufeinanderfolgenden Fehlern für 5 Minuten.
import { normalizeOpenMeteoCurrent, OM_CURRENT_VARS } from './weather.js';

export const OM_FORECAST = 'https://api.open-meteo.com/v1/forecast';
export const OM_GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search';
const breaker = { until: 0, fails: 0, reason: null };
export function breakerState() { return { ...breaker }; }
export function resetBreaker() { breaker.until = 0; breaker.fails = 0; breaker.reason = null; }

function fail(msg, extra = {}) { const e = new Error(msg); Object.assign(e, extra); return e; }

export async function fetchWithTimeout(fetchImpl, url, ms, headers) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try { return await fetchImpl(url, { signal: ac.signal, headers }); }
  catch (e) { if (ac.signal.aborted) throw fail(`Zeitüberschreitung nach ${ms} ms`, { timeout: true }); throw fail('Netzwerkfehler: ' + (e.cause?.code || e.message)); }
  finally { clearTimeout(t); }
}

export function makeWeatherLive({ fetchImpl = globalThis.fetch, base = OM_FORECAST, nowMs = () => Date.now(), headers } = {}) {
  return async function weatherLive(lat, lon, timeoutMs) {
    if (nowMs() < breaker.until) throw fail(`Anbieter vorübergehend übersprungen (${breaker.reason})`, { skipped: true });
    const url = `${base}?latitude=${lat}&longitude=${lon}&current=${OM_CURRENT_VARS}&timezone=GMT&cell_selection=nearest&wind_speed_unit=kmh`;
    let res;
    try { res = await fetchWithTimeout(fetchImpl, url, timeoutMs, headers); }
    catch (e) { if (++breaker.fails >= 3) { breaker.until = nowMs() + 300000; breaker.reason = '3 Fehler in Folge'; } throw e; }
    const text = await res.text();
    if (res.status === 429) {
      const ra = Number(res.headers.get('retry-after'));
      breaker.until = nowMs() + Math.max(60, Number.isFinite(ra) ? ra : 0) * 1000; breaker.reason = 'HTTP 429';
      throw fail('Abrufgrenze erreicht (HTTP 429)', { status: 429 });
    }
    if (!res.ok) { if (++breaker.fails >= 3) { breaker.until = nowMs() + 300000; breaker.reason = '3 Fehler in Folge'; } throw fail(`HTTP ${res.status}`, { status: res.status }); }
    let json; try { json = JSON.parse(text); } catch { throw fail('Unerwartete Antwort (kein JSON)', { unexpected: true }); }
    let norm; try { norm = normalizeOpenMeteoCurrent(json); } catch (e) { throw fail('Unerwartete Antwort: ' + e.message, { unexpected: true }); }
    breaker.fails = 0;
    return {
      provider: 'open-meteo', source: 'open-meteo-forecast',
      data_kind: 'Modelldaten (Open-Meteo «current», Best-Match-Wettermodelle; 15-Minuten-Werte)',
      ...norm, retrieved_at: new Date(nowMs()).toISOString(), source_url: url,
      raw: { response_text: text },
    };
  };
}

export async function geocodeOpenMeteo(q, { fetchImpl = globalThis.fetch, timeoutMs = 4000, lang = 'de' } = {}) {
  const url = `${OM_GEOCODE}?name=${encodeURIComponent(q)}&count=10&language=${lang}&format=json`;
  const res = await fetchWithTimeout(fetchImpl, url, timeoutMs);
  if (!res.ok) throw fail(`HTTP ${res.status}`, { status: res.status });
  const json = await res.json();
  return (json.results || []).map((r) => ({ name: r.name, region: r.admin1 || null, country: r.country || null, lat: r.latitude, lon: r.longitude, source: 'Open-Meteo Geocoding' }));
}

export function searchLocalPlaces(places, q, limit = 10) {
  const n = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const nq = n(q.trim()); if (!nq) return [];
  return places.filter((p) => n(p.name).startsWith(nq)).concat(places.filter((p) => !n(p.name).startsWith(nq) && n(p.name).includes(nq)))
    .slice(0, limit).map((p) => ({ name: p.name, region: p.region, country: p.country, lat: p.lat, lon: p.lon, source: 'Lokale Ortsliste (Natural Earth)' }));
}
