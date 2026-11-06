// Import: ELTeC-deu (European Literary Text Collection, deutsche Romane 1840–1920), Release-Stand des
// GitHub-Repositoriums COST-ELTeC/ELTeC-deu. Texte gemeinfrei, TEI-Auszeichnung CC BY 4.0. Die meisten
// Texte stammen laut <sourceDesc> aus der Digitalen Bibliothek von TextGrid (textgrid:-URI wird gespeichert).
// Auswahl des Startbestands: je Autor:in genau ein Werk (das mit dem kleinsten SHA-256("konstellation-eltec-v1:"+id)),
// danach die ersten N Autor:innen in derselben Hash-Reihenfolge. Aufruf: npm run import:texts:eltec -- [N]
import path from 'node:path';
import zlib from 'node:zlib';
import { CATALOG, fetchBuf, sha256, writeAtomic, readJson, publishManifest, log } from './lib.js';
import { extractParagraphs, buildPassages, PASSAGE_RULE_VERSION, decodeEntities } from '../public/core/passages.js';
import { parseTsv } from './tsv.js';

const BASE = 'https://raw.githubusercontent.com/COST-ELTeC/ELTeC-deu/HEAD';
const N = Number(process.argv[2] || 30);
const DIR = path.join(CATALOG, 'texts');

async function main() {
  const metaBuf = (await fetchBuf(`${BASE}/ELTeC-deu_metadata.tsv`)).buf;
  writeAtomic(path.join(DIR, 'raw', 'ELTeC-deu_metadata.tsv'), metaBuf);
  const rows = parseTsv(metaBuf.toString('utf8'));
  const byAuthor = new Map();
  for (const r of rows) {
    const k = sha256(`konstellation-eltec-v1:${r.filename}`);
    const cur = byAuthor.get(r['author-name']);
    if (!cur || k < cur.k) byAuthor.set(r['author-name'], { r, k });
  }
  const chosen = [...byAuthor.values()].sort((a, b) => (a.k < b.k ? -1 : 1));
  const manifest = readJson(path.join(DIR, 'manifest.json'), { catalog: 'texts', schema: 1, items: [], rejected: [] });
  const have = new Map(manifest.items.map((x) => [x.id, x]));
  const rejected = [];
  let count = manifest.items.filter((x) => x.provider === 'eltec-deu').length;
  for (const { r } of chosen) {
    if (count >= N) break;
    const id = `eltec-${r.filename}`;
    if (have.has(id)) continue;
    try {
      const { buf } = await fetchBuf(`${BASE}/level1/${r.filename}.xml`, { timeoutMs: 120000 });
      const tei = buf.toString('utf8');
      if (!/<TEI\b/.test(tei)) throw new Error('keine TEI-Datei');
      const lic = (tei.match(/<licence target="([^"]+)"/) || [])[1] || null;
      const digital = (tei.match(/<bibl type="digitalSource">([\s\S]*?)<\/bibl>/) || [])[1] || '';
      const tgUri = (digital.match(/target="(textgrid:[^"]+)"/) || [])[1] || null;
      const firstEd = (tei.match(/<bibl type="firstEdition">([\s\S]*?)<\/bibl>/) || [])[1];
      const paragraphs = extractParagraphs(tei);
      const { passages, excluded } = buildPassages(paragraphs);
      if (passages.length < 5) throw new Error('zu wenige verwendbare Stellen: ' + passages.length);
      const teiSha = sha256(buf);
      const teiRel = `works/${r.filename}.${teiSha.slice(0, 12)}.xml.gz`;
      writeAtomic(path.join(DIR, teiRel), zlib.gzipSync(buf, { level: 9 }));
      const pass = { work_id: id, rule: PASSAGE_RULE_VERSION, source_sha256: teiSha, excluded, passages };
      const passText = JSON.stringify(pass);
      const passSha = sha256(Buffer.from(passText));
      const passRel = `works/${r.filename}.${passSha.slice(0, 12)}.passages.json`;
      writeAtomic(path.join(DIR, passRel), passText);
      const item = {
        id, provider: 'eltec-deu', language: 'de',
        author: r['author-name'], author_birth: r['author-birth'], author_death: r['author-death'], author_gnd: r['author-ids'] !== 'NA' ? r['author-ids'] : null,
        title: r.title, first_edition: r['first-edition'] !== 'NA' ? r['first-edition'] : null,
        first_edition_note: firstEd ? decodeEntities(firstEd.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim() : null,
        genre: 'Roman/Erzählung (Prosa)',
        tei_file: teiRel, tei_sha256: teiSha, passages_file: passRel, passages_sha256: passSha, passage_count: passages.length, passage_rule: PASSAGE_RULE_VERSION,
        source_url: `https://github.com/COST-ELTeC/ELTeC-deu/blob/master/level1/${r.filename}.xml`,
        source_raw_url: `${BASE}/level1/${r.filename}.xml`,
        textgrid_uri: tgUri, textgrid_url: tgUri ? `https://textgridrep.org/${tgUri}` : null,
        source_name: tgUri ? 'ELTeC-deu (COST Action CA16204), Textgrundlage: TextGrid Digitale Bibliothek' : 'ELTeC-deu (COST Action CA16204)',
        rights: 'Text gemeinfrei; TEI-Auszeichnung ELTeC CC BY 4.0' + (lic ? ` (${lic})` : ''),
        attribution: `${r['author-name']}: ${r.title}. ELTeC-deu, Release 1.0.0, DOI 10.5281/zenodo.4662482, CC BY 4.0.` + (tgUri ? ` Textgrundlage TextGrid Repository ${tgUri}.` : ''),
        retrieved_at: new Date().toISOString(),
      };
      have.set(id, item); count++;
      log('ok', id, r['author-name'], '–', r.title, `${passages.length} Stellen`, JSON.stringify(excluded));
    } catch (e) { rejected.push({ id, reason: e.message, at: new Date().toISOString() }); log('verworfen', id, e.message); }
  }
  manifest.items = [...have.values()];
  manifest.rejected = [...(manifest.rejected || []), ...rejected];
  manifest.generated_at = new Date().toISOString();
  manifest.selection_rule = 'Zuerst gleichverteilte Wahl eines Werkes (sortiert nach id), danach gleichverteilte Wahl einer Stelle innerhalb dieses Werkes (Reihenfolge n).';
  manifest.passage_rule = PASSAGE_RULE_VERSION;
  const m = publishManifest('texts', manifest);
  log(`Texte: aktiv ${m.item_count} Werke von ${new Set(m.items.map((x) => x.author)).size} Autor:innen, Version ${m.version.slice(0, 12)}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
