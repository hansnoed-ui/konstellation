// Portabler Paketexport: Protokoll, Bilddatei, Textstelle und eine eigenständige Anzeige-Seite.
// Das Paket genügt zum erneuten Anzeigen. Eine rechnerische Neuauswahl braucht zusätzlich die Bestände
// in den im Protokoll genannten Versionen (siehe LIESMICH.txt im Paket).
import { makeZip } from './zip.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function packageFiles(record, imageBytes) {
  const img = record.culture.image; const ext = (img.file || img.image_url || 'bild.jpg').split('?')[0].split('.').pop().toLowerCase().replace(/[^a-z]/g, '') || 'jpg';
  const imgName = imageBytes ? `bild.${ext}` : null; const imgSrc = imgName || img.image_url;
  const w = record.science.weather; const a = record.science.astro; const t = record.culture.text;
  const vals = Object.entries(w.values).map(([k, v]) => `<li>${esc(k)}: ${v.value === null ? 'fehlt' : esc(v.value) + ' ' + esc(v.unit)}</li>`).join('');
  const html = `<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Konstellation ${esc(record.id)}</title>
<style>body{font:17px/1.6 Georgia,serif;max-width:46rem;margin:2rem auto;padding:0 1rem;color:#222;background:#faf8f3}img{max-width:100%;height:auto}blockquote{white-space:pre-line;border-left:3px solid #999;margin:1rem 0;padding-left:1rem}small{color:#555}</style>
<h1>${esc(record.input.display_name)}</h1><p>${esc(record.input.place_label || '')} (${esc(record.input.lat6)}, ${esc(record.input.lon6)}) · ${esc(record.time.query_time_utc)}</p>
<h2>Wetter</h2><p>${esc(w.level_label)} · ${esc(w.data_kind)} · Datenzeit ${esc(w.data_time_utc)}${w.distance_km !== null ? ' · ' + esc(w.distance_km) + ' km vom gewählten Ort' : ''}</p><ul>${vals}</ul>
<h2>Exoplanet</h2><p>${esc(a.id)} – ${esc(a.catalog)}</p>
<h2>Bild</h2><figure><img src="${esc(imgSrc)}" alt="${esc(img.title)}">${imgName ? '' : '<p><small>Bilddatei nicht im Paket (Online-Fund ohne lokale Kopie); Anzeige lädt vom Anbieter.</small></p>'}<figcaption>${esc(img.artist || 'unbekannt')}: <i>${esc(img.title)}</i>, ${esc(img.date || '')}. ${esc(img.source_name)}. ${esc(img.rights)}. <a href="${esc(img.source_url)}">Quelle</a>${img.source_mode === 'online' ? ' (online gezogen)' : ''}</figcaption></figure>
<h2>Text</h2><blockquote${t.passage.form === 'vers' ? ' style="white-space:pre-wrap"' : ''}>${esc(t.passage.text)}</blockquote><p><small>${esc(t.work.author)}: <i>${esc(t.work.title)}</i>. Stelle ${esc(t.passage.n)}, Kapitel ${esc(t.passage.chapter)}, Absatz ${esc(t.passage.p_from)}${t.passage.p_to !== t.passage.p_from ? '–' + esc(t.passage.p_to) : ''}. ${esc(t.work.attribution)} ${esc(t.work.rights)}${t.work.source_mode === 'online' ? ' (online gezogen)' : ''}</small></p>
<p><small>S1 ${esc(record.seeds.S1.hex)}</small></p></html>`;
  const readme = `KONSTELLATION – Paketexport\n\nprotokoll.json  vollständiges Protokoll (Eingabe, S0, S1, Ziehungen, Funde, Bestandsversionen, Rückfallebenen)\n${imgName ? `${imgName}        Bilddatei, SHA-256 ${img.sha256}\n` : `(kein Bild)     Online-Fund ohne lokale Kopie: ${img.image_url}\n`}textstelle.txt  ausgewählte Textstelle (SHA-256 des Wortlauts im Protokoll)\nanzeige.html    Ansicht ohne Internetverbindung\n\nDieses Paket genügt zum erneuten Anzeigen. Eine vollständige rechnerische Neuauswahl braucht zusätzlich die\nBestände in den Versionen aus protokoll.json → catalogs (Manifeste unter data/catalog/*/manifests/<version>.json).\n`;
  return [
    { name: 'protokoll.json', data: JSON.stringify(record, null, 2) },
    ...(imgName ? [{ name: imgName, data: imageBytes }] : []),
    { name: 'textstelle.txt', data: `${t.work.author}: ${t.work.title}\nStelle ${t.passage.n}, Kapitel ${t.passage.chapter}\n\n${t.passage.text}\n` },
    { name: 'anzeige.html', data: html },
    { name: 'LIESMICH.txt', data: readme },
  ];
}
export const buildPackage = (record, imageBytes) => makeZip(packageFiles(record, imageBytes));
