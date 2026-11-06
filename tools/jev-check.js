// Optionale jev-Prüfung (TypeSafe «System One», Entscheidungsform NOUL/CHOICE) für den Textbestand.
// Eng begrenzte Frage je Stichprobe von Textstellen: «Ist dieser Abschnitt erzählender Text – oder Inhaltsverzeichnis,
// Vorspann, Lizenzvermerk, Navigation?» Das Ergebnis ist eine Modell-Einschätzung, keine verifizierte Tatsache und
// keine Rechteprüfung. Es verändert den Bestand NICHT und greift nie in die Zufallsauswahl ein; der Bericht liegt unter
// docs/jev/ und dient als Hinweis für die Pflege der Stellenregel (public/core/passages.js).
//
// Aufruf:  TYPESAFE_API_KEY=… node tools/jev-check.js [--stichprobe N] [--modell jev-latest]
// Ohne Schlüssel: schreibt nur den Bericht «nicht ausgeführt» und endet mit Exit 0 (der Durchlauf braucht jev nie).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { loadConfig, ROOT } from '../server/index.js';

const API = 'https://api.typesafe.ai/v1/systemone';
const args = process.argv.slice(2);
const N = Number(args[args.indexOf('--stichprobe') + 1] || 60);
const MODEL = args.includes('--modell') ? args[args.indexOf('--modell') + 1] : 'jev-latest';
const KEY = process.env.TYPESAFE_API_KEY;
const cfg = loadConfig(); const C = path.resolve(ROOT, cfg.catalogDir);
const outDir = path.join(ROOT, 'docs', 'jev'); fs.mkdirSync(outDir, { recursive: true });
const sha = (s) => createHash('sha256').update(s).digest('hex');

const texts = JSON.parse(fs.readFileSync(path.join(C, 'texts', 'manifest.json'), 'utf8'));
// Stichprobe deterministisch (SHA-256 über Werk-id und Stellennummer), damit Läufe vergleichbar sind.
const sample = [];
for (const w of texts.items) {
  const d = JSON.parse(fs.readFileSync(path.join(C, 'texts', w.passages_file), 'utf8'));
  for (const p of d.passages) sample.push({ work: w.id, author: w.author, title: w.title, n: p.n, text: p.text, k: sha(`jev-sample:${w.id}:${p.n}`) });
}
sample.sort((a, b) => (a.k < b.k ? -1 : 1));
const chosen = sample.slice(0, N);

const report = { generated_at: new Date().toISOString(), model: MODEL, catalog_version: texts.version, question: null, sample_size: chosen.length, executed: false, results: [], flagged: [], note: 'Modell-Einschätzung von jev (TypeSafe). Keine verifizierte Tatsache, kein Lizenznachweis. Verändert den Bestand nicht.' };
report.question = {
  art: { type: 'choice', instructions: 'Was ist dieser Abschnitt aus einem deutschsprachigen Roman des 19./frühen 20. Jahrhunderts am ehesten?', criteria: { erzaehltext: 'Erzählender Text oder Dialog aus dem Roman selbst', inhaltsverzeichnis: 'Inhaltsverzeichnis, Kapitelliste oder Navigation', vorspann: 'Titelei, Vorwort des Herausgebers, Editions- oder Lizenzvermerk', fragment: 'Abgebrochener oder zusammenhangloser Textrest (z. B. Satz mitten darin beginnend)' } },
};

async function ask(text) {
  const r = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` }, body: JSON.stringify({ model: MODEL, state: { abschnitt: text }, questions: report.question }), signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

if (!KEY) {
  report.note += ' NICHT AUSGEFÜHRT: kein TYPESAFE_API_KEY gesetzt.';
} else {
  report.executed = true;
  for (const s of chosen) {
    try {
      const a = await ask(s.text);
      const ans = a.answers?.art; const choice = ans?.choice ?? null; const probs = ans?.probabilities ?? null;
      report.results.push({ work: s.work, n: s.n, choice, probabilities: probs, model: a.model ?? MODEL });
      if (choice && choice !== 'erzaehltext') report.flagged.push({ work: s.work, author: s.author, title: s.title, n: s.n, choice, probabilities: probs, excerpt: s.text.slice(0, 240) });
    } catch (e) { report.results.push({ work: s.work, n: s.n, error: String(e.message) }); }
  }
}
const stamp = report.generated_at.slice(0, 10);
fs.writeFileSync(path.join(outDir, `jev-textpruefung-${stamp}.json`), JSON.stringify(report, null, 1));
const md = `# jev-Textprüfung ${stamp}\n\n- Modell: ${MODEL} · Bestand texts ${texts.version.slice(0, 12)}… · Stichprobe ${chosen.length} Stellen\n- Ausgeführt: ${report.executed ? 'ja' : 'nein (kein Schlüssel)'}\n- Frage: ${report.question.art.instructions} (${Object.keys(report.question.art.criteria).join(' / ')})\n- Auffällig (nicht «erzaehltext»): ${report.flagged.length}\n${report.flagged.map((f) => `  - ${f.work} Stelle ${f.n} (${f.author}: ${f.title}) → ${f.choice}: «${f.excerpt.replace(/\n/g, ' ')}…»`).join('\n')}\n- Fehler: ${report.results.filter((r) => r.error).length}\n\n${report.note}\n`;
fs.writeFileSync(path.join(outDir, `jev-textpruefung-${stamp}.md`), md);
console.log(md);
