// Online-Ziehung («online zuerst»): Bild und Werk werden direkt aus grossen, offenen Datenbanken gezogen; der lokale
// Bestand ist nur Rückfall. Läuft unverändert in Node und im Browser.
//
// Regel (Version online/1):
//  1. Jeder Anbieter meldet zu Beginn die Grösse seines Auswahlraums (z. B. Anzahl Objekt-IDs, höchste ID, Werke in
//     der Sprachliste) samt Abrufzeit. Die Räume werden zu einem Gesamtraum der Grösse n = Σ n_i aneinandergereiht.
//  2. Index = uniformIndex(S1, «<art>-online», n) (gleiche verzerrungsfreie Ziehung wie im Bestand). Der Index fällt
//     in den Raum genau eines Anbieters; der Anbieter löst ihn auf (ID, Metadaten, Datei).
//  3. Ein Fund wird nur angenommen, wenn der Anbieter die Freigabe maschinenlesbar bestätigt (z. B. isPublicDomain=true,
//     is_public_domain=true, «Public domain in the USA.») und die Datei bzw. der Text ladbar und formal gültig ist.
//     Sonst wird mit dem Label «<art>-online#ersatz<i>» über denselben Gesamtraum neu gezogen (Lücken im ID-Raum,
//     nicht freigegebene oder bildlose Objekte sind erwartbar und werden protokolliert).
//  4. Zeitbudget und Versuche sind endlich; danach fällt der Ablauf auf den lokalen Bestand zurück. Alles steht im Protokoll.
//  5. Die Auswahlräume sind nicht eingefroren (Datenbanken wachsen). Eine Online-Ziehung ist deshalb über das Protokoll
//     wiederholbar (ID, URL, Prüfsumme), aber nicht gegen einen späteren Datenbankstand neu berechenbar.
import { uniformIndex } from './seed.js';

export const ONLINE_RULE_VERSION = 'online/1';
export const ONLINE_RULE = 'Gesamtraum = aneinandergereihte Auswahlräume der Anbieter (Grösse zum Abfragezeitpunkt); Index = uniformIndex(S1, «<art>-online», n); nicht auflösbare, nicht freigegebene oder nicht ladbare Treffer werden mit «<art>-online#ersatz<i>» über denselben Gesamtraum neu gezogen; endliches Zeitbudget und endliche Versuche, sonst Bestand.';

export class Reject extends Error { constructor(reason, extra = {}) { super(reason); this.reject = true; Object.assign(this, extra); } }

// providers: [{ id, name, space(ctx) → {total, retrieved_at, note}, resolve(index, ctx) → item | throws Reject }]
export function makeOnlineDraw({ kind, providers, budgetMs = 12000, maxTries = 12, nowMs = () => Date.now(), ctx = {} }) {
  const label0 = `${kind}-online`;
  return async function drawOnline(seedHex, log) {
    const t0 = nowMs(); const left = () => budgetMs - (nowMs() - t0);
    const c = { ...ctx, left, nowMs };
    // 1) Auswahlräume
    const spaces = [];
    await Promise.all(providers.map(async (p) => {
      const ts = nowMs();
      try { const s = await p.space(c); if (!(s.total > 0)) throw new Error('leerer Auswahlraum'); spaces.push({ provider: p, ...s }); log.push({ step: `${kind}.online.space`, outcome: 'ok', provider: p.id, total: s.total, duration_ms: Math.round(nowMs() - ts) }); }
      catch (e) { log.push({ step: `${kind}.online.space`, outcome: 'Anbieter übersprungen', provider: p.id, error: String(e.message || e), duration_ms: Math.round(nowMs() - ts) }); }
    }));
    spaces.sort((a, b) => (a.provider.id < b.provider.id ? -1 : 1)); // feste Reihenfolge (nach Anbieter-ID), damit der Gesamtraum eindeutig ist
    const n = spaces.reduce((a, s) => a + s.total, 0);
    const draws = [];
    if (!n) { const e = new Error('kein Anbieter erreichbar'); e.draws = draws; throw e; }
    // 2) Ziehung mit Ersatz
    for (let i = 0; i < maxTries; i++) {
      if (left() < 1000) { log.push({ step: `${kind}.online`, outcome: 'abgebrochen: Zeitbudget erschöpft', tries: i }); break; }
      const label = i === 0 ? label0 : `${label0}#ersatz${i}`;
      const d = await uniformIndex(seedHex, label, n);
      let off = 0; let sp = null; for (const s of spaces) { if (d.index < off + s.total) { sp = s; break; } off += s.total; }
      const draw = { label, n: d.n, index: d.index, counter: d.counter, provider: sp.provider.id, provider_index: d.index - off };
      const ts = nowMs();
      try {
        const item = await sp.provider.resolve(d.index - off, c);
        draws.push({ ...draw, id: item.id, outcome: 'ok', duration_ms: Math.round(nowMs() - ts) });
        return {
          item,
          online: {
            rule_version: ONLINE_RULE_VERSION, rule: ONLINE_RULE,
            spaces: spaces.map((s) => ({ provider: s.provider.id, name: s.provider.name, total: s.total, retrieved_at: s.retrieved_at, note: s.note ?? null })),
            total: n, draws,
          },
        };
      } catch (e) {
        draws.push({ ...draw, id: e.id ?? null, outcome: (e.reject ? 'verworfen: ' : 'Fehler: ') + String(e.message || e), duration_ms: Math.round(nowMs() - ts) });
      }
    }
    const e = new Error(`kein freigegebener Treffer nach ${draws.length} Versuchen`); e.draws = draws; e.spaces = spaces.map((s) => ({ provider: s.provider.id, total: s.total })); throw e;
  };
}
