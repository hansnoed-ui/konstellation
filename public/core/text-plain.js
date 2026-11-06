// Textstellen aus einem Volltext ohne Auszeichnung (Project Gutenberg, UTF-8).
// Regel (Version passages-plain/1), baut auf passages/1 auf:
//  1. Nur der Text zwischen «*** START OF …» und «*** END OF …»; Gutenberg-Vorspann und -Lizenz entfallen.
//  2. Einheit ist der durch Leerzeilen getrennte Absatz. Überschriften (kurze Zeile ohne Satzschluss, Zahl/Römisch,
//     «Kapitel», «Chapter», Versalien) zählen als Kapitelbeginn und werden nicht als Stelle verwendet.
//  3. Absätze aus mehreren kurzen Zeilen (im Mittel unter 45 Zeichen, mindestens 3 Zeilen) gelten als Vers: die
//     Zeilenstruktur bleibt erhalten (Form «vers»); sonst werden Zeilenumbrüche zu Leerzeichen (Form «prosa»).
//  4. Längenregel, Zusammenfassen und Ausschlüsse wie passages/1 (80–180 Wörter, Reste unter 40 verworfen,
//     Verzeichnis-/Lizenzzeilen ausgeschlossen). Ein Inhaltsverzeichnis am Anfang wird komplett übersprungen.
import { buildPassages, countWords, looksLikeNonText } from './passages.js';

export const PLAIN_RULE_VERSION = 'passages-plain/1';

export function stripGutenberg(text) {
  const s = text.search(/^\*\*\* ?START OF (THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*\s*$/mi);
  const e = text.search(/^\*\*\* ?END OF (THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*\s*$/mi);
  if (s < 0 || e < 0 || e <= s) throw new Error('Gutenberg-Markierungen (*** START/END ***) nicht gefunden');
  return text.slice(text.indexOf('\n', s) + 1, e);
}

const isHeading = (t) => {
  if (countWords(t) > 8 || /[.!?…]["»“]?$/.test(t) && !/^\d+\.$/.test(t)) return false;
  return /^(kapitel|chapter|buch|teil|erstes|zweites|drittes|viertes|fünftes|sechstes|siebentes|siebtes|achtes|neuntes|zehntes|prolog|epilog|vorrede|vorwort|akt|szene|scene|act)\b/i.test(t)
    || /^([IVXLC]+|\d+)[.:]?(\s|$)/.test(t) || (t.length > 2 && t === t.toUpperCase() && /[A-ZÄÖÜ]/.test(t))
    || (countWords(t) <= 4 && !/[.!?,;:»«"”]$/.test(t)); // kurze Zeile ohne Satzzeichen (z. B. «Zueignung», «Nacht»)
};

export function plainParagraphs(body) {
  const blocks = body.replace(/\r\n?/g, '\n').split(/\n[ \t]*\n+/);
  const out = []; let chapter = 0; let heads = []; let pIndex = 0; let skipToc = false;
  for (const raw of blocks) {
    const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    const one = lines.join(' ').replace(/\s+/g, ' ').trim();
    if (/^(inhalt|inhaltsverzeichnis|contents|table of contents)\b/i.test(one)) { skipToc = true; continue; }
    if (lines.length === 1 && isHeading(one)) { chapter++; heads = [one]; pIndex = 0; skipToc = false; continue; }
    if (skipToc && lines.every((l) => countWords(l) <= 8)) continue; // Verzeichniszeilen nach «Inhalt»
    skipToc = false;
    const avg = lines.reduce((a, l) => a + l.length, 0) / lines.length;
    const verse = lines.length >= 3 && avg < 45;
    pIndex++;
    out.push({ chapter, heads: [...heads], pIndex, text: verse ? lines.join('\n') : one, form: verse ? 'vers' : 'prosa' });
  }
  return out;
}

export function passagesFromPlain(text) {
  const paragraphs = plainParagraphs(stripGutenberg(text));
  const forms = new Map(paragraphs.map((p) => [p.text, p.form]));
  const r = buildPassages(paragraphs);
  r.passages = r.passages.map((p) => ({ ...p, form: forms.get(p.text) ?? (p.text.includes('\n') && !p.text.includes('\n\n') ? 'vers' : p.text.split('\n\n').some((x) => forms.get(x) === 'vers') ? 'vers' : 'prosa') }));
  return { rule: PLAIN_RULE_VERSION, passages: r.passages, excluded: r.excluded, paragraphs: paragraphs.length, chapters: paragraphs.at(-1)?.chapter ?? 0 };
}
export { looksLikeNonText };
