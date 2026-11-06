// Zerlegung eines ELTeC-/TEI-Romans in auswählbare Textstellen.
// Dokumentierte Regel (Version passages/1):
//  1. Nur <text><body>; <front>/<back>, Kopfzeilen (<head>), Anmerkungen (<note>) und Verse (<lg>) werden
//     nicht als Prosastellen verwendet.
//  2. Einheit ist der TEI-Absatz <p>. Inline-Auszeichnung wird entfernt, der Wortlaut bleibt erhalten;
//     Zeilenumbrüche der Quelldatei werden zu einfachen Leerzeichen (sie sind Satzformatierung, keine Verse).
//  3. Ausgeschlossen werden Absätze, die wie Inhaltsverzeichnis, Navigation oder Lizenz-/Editionsvorspann aussehen
//     (siehe looksLikeNonText) – mit protokolliertem Grund.
//  4. Absätze mit 80–180 Wörtern sind je eine Stelle. Kürzere aufeinanderfolgende Absätze desselben Kapitels werden
//     zusammengefasst, solange die Summe ≤ 180 Wörter bleibt, bis mindestens 80 erreicht sind. Absätze über
//     180 Wörtern werden an Satzgrenzen in zusammenhängende Stücke von 80–180 Wörtern geteilt (gierig).
//  5. Reste unter 40 Wörtern werden verworfen.
export const PASSAGE_RULE_VERSION = 'passages/1';
const MIN = 80, MAX = 180, MIN_REST = 40;

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENT[e] ?? m;
  });
}
function stripTags(s) {
  return decodeEntities(s.replace(/<note\b[\s\S]*?<\/note>/g, '').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}
export const countWords = (s) => (s.match(/\S+/g) || []).length;

export function looksLikeNonText(t) {
  if (/^(inhalt|inhaltsverzeichnis|verzeichnis)\b/i.test(t)) return 'Inhaltsverzeichnis-Überschrift';
  if (/\.{4,}|…\s*\d+\s*$/.test(t) && /\d/.test(t)) return 'Verzeichniszeile (Füllpunkte/Seitenzahl)';
  const toks = t.split(/\s+/);
  const num = toks.filter((x) => /^([0-9]+|[IVXLC]+)[.,:]?$/.test(x)).length;
  if (toks.length >= 8 && num / toks.length > 0.25) return 'überwiegend Zahlen/Seitenangaben';
  if (/(project gutenberg|creative commons|lizenz|license|textgrid|zeno\.org|https?:\/\/)/i.test(t)) return 'Lizenz-/Quellenvermerk oder URL';
  return null;
}

function splitSentences(t) {
  // Satzgrenze: . ! ? oder … gefolgt von Leerzeichen und einem Grossbuchstaben/Anführungszeichen.
  const parts = t.split(/(?<=[.!?…][»«"'”“)]?)\s+(?=[A-ZÄÖÜ»«"„“(—–-])/u);
  return parts.filter(Boolean);
}

export function extractParagraphs(tei) {
  const body = (tei.match(/<body\b[^>]*>([\s\S]*)<\/body>/) || [])[1];
  if (!body) throw new Error('kein <body>');
  const out = []; // {chapter, heads:[...], pIndex, text}
  let chapter = 0; let heads = []; let pIndex = 0;
  const re = /<div\b[^>]*type="chapter"[^>]*>|<head\b[^>]*>([\s\S]*?)<\/head>|<p\b[^>]*>([\s\S]*?)<\/p>|<lg\b[\s\S]*?<\/lg>/g;
  let m; let lastWasHead = false;
  while ((m = re.exec(body))) {
    if (m[0].startsWith('<div')) { chapter++; heads = []; pIndex = 0; lastWasHead = false; continue; }
    if (m[0].startsWith('<head')) { const h = stripTags(m[1]); if (h) { if (!lastWasHead) heads = []; heads.push(h); } lastWasHead = true; continue; }
    lastWasHead = false;
    if (m[0].startsWith('<lg')) continue;
    pIndex++;
    const text = stripTags(m[2]);
    if (text) out.push({ chapter, heads: [...heads], pIndex, text });
  }
  return out;
}

export function buildPassages(paragraphs) {
  const passages = []; const excluded = {};
  let buf = null;
  const flush = () => { if (buf && buf.words >= MIN) passages.push(buf); else if (buf) excluded['zu kurz'] = (excluded['zu kurz'] || 0) + 1; buf = null; };
  for (const p of paragraphs) {
    const why = looksLikeNonText(p.text);
    if (why) { excluded[why] = (excluded[why] || 0) + 1; flush(); continue; }
    const w = countWords(p.text);
    if (buf && (buf.chapter !== p.chapter || buf.words + w > MAX)) flush();
    if (w > MAX) {
      flush();
      let cur = []; let cw = 0; const chunks = [];
      for (const s of splitSentences(p.text)) {
        const sw = countWords(s);
        if (cw + sw > MAX && cw >= MIN) { chunks.push(cur.join(' ')); cur = []; cw = 0; }
        cur.push(s); cw += sw;
      }
      if (cur.length) chunks.push(cur.join(' '));
      chunks.forEach((c, i) => {
        const cwc = countWords(c);
        if (cwc >= MIN_REST && cwc <= MAX * 1.5) passages.push({ chapter: p.chapter, heads: p.heads, p_from: p.pIndex, p_to: p.pIndex, part: `${i + 1}/${chunks.length}`, text: c, words: cwc });
        else excluded['Satzstück ausserhalb Längenregel'] = (excluded['Satzstück ausserhalb Längenregel'] || 0) + 1;
      });
      continue;
    }
    if (!buf) buf = { chapter: p.chapter, heads: p.heads, p_from: p.pIndex, p_to: p.pIndex, part: null, text: p.text, words: w, paras: [p.text] };
    else { buf.text += '\n\n' + p.text; buf.paras.push(p.text); buf.p_to = p.pIndex; buf.words += w; }
    if (buf.words >= MIN) flush();
  }
  flush();
  return { passages: passages.map(({ paras, ...x }, i) => ({ n: i + 1, ...x })), excluded };
}
