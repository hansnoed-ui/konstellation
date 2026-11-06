// Kanonische Serialisierung (an RFC 8785 / JCS angelehnt) und SHA-256 – läuft in Node (>=22) und im Browser.
// - Objektschlüssel nach UTF-16-Codeeinheiten sortiert (Array.prototype.sort ohne Vergleichsfunktion), keine Leerzeichen.
// - Zahlen: nur endliche Zahlen, ECMAScript-Darstellung (wie JCS); -0 wird 0.
// - undefined ist verboten (nicht still entfernt); fehlende Werte sind explizit null.
export function canonicalize(value) {
  if (value === null) return 'null';
  const t = typeof value;
  if (t === 'boolean') return value ? 'true' : 'false';
  if (t === 'number') {
    if (!Number.isFinite(value)) throw new Error('canonicalize: nicht-endliche Zahl');
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (t === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  if (t === 'object') {
    return '{' + Object.keys(value).sort().map((k) => {
      if (value[k] === undefined) throw new Error(`canonicalize: undefined bei «${k}»`);
      return JSON.stringify(k) + ':' + canonicalize(value[k]);
    }).join(',') + '}';
  }
  throw new Error('canonicalize: nicht unterstützter Typ ' + t);
}

const enc = new TextEncoder();
export async function sha256Hex(data) {
  const bytes = typeof data === 'string' ? enc.encode(data) : data;
  const d = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export const canonicalHash = (v) => sha256Hex(canonicalize(v));
