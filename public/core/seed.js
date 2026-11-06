// Auswahlkern: Normalisierung, S0, S1 und unverzerrte Indexziehung aus SHA-256-Strömen.
import { canonicalize, sha256Hex } from './canonical.js';

export const ALGORITHM_VERSION = 'konstellation/1';

// Name: Unicode-NFC, Leerraum (inkl. Tabs/Zeilenumbrüche/geschützte Leerzeichen) zu einem Leerzeichen, aussen gekürzt.
// Gross-/Kleinschreibung bleibt erhalten («Ada» ≠ «ada»).
export function normalizeName(s) {
  if (typeof s !== 'string') throw new Error('Name fehlt');
  const n = s.normalize('NFC').replace(/[\s  -​  　]+/gu, ' ').trim();
  if (!n) throw new Error('Bitte einen Namen oder ein Pseudonym eingeben.');
  if ([...n].length > 120) throw new Error('Der Name ist zu lang (höchstens 120 Zeichen).');
  return n;
}

// Koordinaten: Breite −90…90, Länge auf −180…<180 gefaltet; Darstellung mit genau sechs Nachkommastellen
// (Runden nach toFixed, ≈0,11 m). Diese Zeichenketten gehen in S0 ein.
export function normalizeCoords(lat, lon) {
  lat = Number(lat); lon = Number(lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('Koordinaten fehlen oder sind ungültig.');
  if (lat < -90 || lat > 90) throw new Error('Breite muss zwischen −90 und 90 liegen.');
  lon = ((((lon + 180) % 360) + 360) % 360) - 180;
  const lat6 = lat.toFixed(6) === '-0.000000' ? '0.000000' : lat.toFixed(6);
  const lon6 = lon.toFixed(6) === '-0.000000' ? '0.000000' : lon.toFixed(6);
  return { lat: Number(lat6), lon: Number(lon6), lat6, lon6 };
}

export function s0Input({ normalizedName, lat6, lon6, queryTimeUtc }) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(queryTimeUtc)) throw new Error('Zeitpunkt muss ISO-8601 UTC mit Millisekunden sein');
  return { algorithm: ALGORITHM_VERSION, stage: 'S0', name: normalizedName, lat: lat6, lon: lon6, query_time_utc: queryTimeUtc };
}
export async function computeS0(args) {
  const input = s0Input(args);
  const canonical = canonicalize(input);
  return { hex: await sha256Hex(canonical), canonical };
}

export function s1Input({ s0, weatherForSeed, astroForSeed }) {
  return { algorithm: ALGORITHM_VERSION, stage: 'S1', s0, weather: weatherForSeed, astro: astroForSeed };
}
export async function computeS1(args) {
  const canonical = canonicalize(s1Input(args));
  return { hex: await sha256Hex(canonical), canonical };
}

const TWO64 = 1n << 64n;
// Gleichverteilte Ziehung eines Index 0…n−1 aus dem Strom (seed, label) per Verwerfungsverfahren:
// u = erste 8 Bytes (big-endian) von SHA-256(seed + "|" + label + "|" + k), k = 0,1,2,…
// Akzeptiert wird u < floor(2^64 / n)·n, Ergebnis u mod n. Damit entsteht keine Modulo-Verzerrung.
export async function uniformIndex(seedHex, label, n) {
  if (!Number.isInteger(n) || n < 1) throw new Error('uniformIndex: leere Auswahlmenge');
  const N = BigInt(n); const limit = (TWO64 / N) * N;
  for (let k = 0; k < 1000; k++) {
    const digest = await sha256Hex(`${seedHex}|${label}|${k}`);
    const u = BigInt('0x' + digest.slice(0, 16));
    if (u < limit) return { index: Number(u % N), n, label, counter: k, digest };
  }
  throw new Error('uniformIndex: keine Annahme nach 1000 Versuchen');
}
