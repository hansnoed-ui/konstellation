// Oberfläche im echten Browser (Playwright/Chromium): Desktop und schmales Mobilformat, Server-Modus und statischer Modus,
// jeweils offline (KONSTELLATION_OFFLINE=1 bzw. ?offline, alle externen Hosts geblockt).
// Aufruf: node test/ui.e2e.mjs   (schreibt Screenshots nach data/runtime/screenshots/)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { ROOT } from '../server/index.js';

const out = path.join(ROOT, 'data/runtime/screenshots'); fs.mkdirSync(out, { recursive: true });
const port = 8790 + Math.floor(Math.random() * 100);
const srv = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(port), KONSTELLATION_OFFLINE: '1' }, stdio: 'inherit' });
await new Promise((r) => setTimeout(r, 800));
// Statischer Modus: reiner Dateiserver ohne /api, mit Beständen unter /catalog/
const staticSrv = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = p.startsWith('/catalog/') ? path.join(ROOT, 'data/catalog', p.slice(9)) : path.join(ROOT, 'public', p === '/' ? 'index.html' : p);
  fs.readFile(f, (e, b) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.geojson': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png' }[path.extname(f)] || 'application/octet-stream' }); res.end(b); });
});
await new Promise((r) => staticSrv.listen(0, '127.0.0.1', r));
const sport = staticSrv.address().port;

const results = []; const fail = (m) => { results.push('FEHLER: ' + m); };
const browser = await chromium.launch();
async function run(label, url, viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: 'de-CH' });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (r) => r.abort()); // externes Netz gesperrt
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(String(e))); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400 && !r.url().endsWith('api/config')) errors.push(`HTTP ${r.status()} ${r.url()}`); });
  await page.goto(url);
  await page.getByRole('button', { name: 'Zufallsname' }).click();
  const name = await page.locator('#name').inputValue(); if (!name.includes(' ')) fail(label + ': Zufallsname leer');
  await page.locator('#ortsuche').fill('Nairobi'); await page.keyboard.press('Enter');
  await page.locator('#treffer li[data-i]').first().waitFor({ timeout: 8000 });
  await page.locator('#treffer li[data-i]').first().click();
  const lat = await page.locator('#lat').inputValue(); if (!lat.startsWith('-1.2')) fail(label + ': Ort nicht gesetzt: ' + lat);
  // Koordinaten direkt (Meer)
  await page.locator('#lat').fill('0.5'); await page.locator('#lon').fill('-29'); await page.getByRole('button', { name: 'Übernehmen' }).click();
  await page.screenshot({ path: path.join(out, `${label}-eingabe.png`), fullPage: true });
  // Tastatur: Enter auf dem Knopf
  await page.locator('#erzeugen').focus(); await page.keyboard.press('Enter');
  await page.locator('#ergebnis:not([hidden])').waitFor({ timeout: 20000 });
  const img = page.locator('#b-img'); await img.waitFor();
  const ok = await img.evaluate((i) => i.complete && i.naturalWidth > 200); if (!ok) fail(label + ': Bild nicht geladen');
  const txt = await page.locator('#t-text').textContent(); if ((txt || '').split(/\s+/).length < 40) fail(label + ': Textstelle zu kurz');
  const ebene = await page.locator('#w-ebene').textContent(); if (!/Archiv/.test(ebene)) fail(label + ': offline müsste Archiv sein: ' + ebene);
  const ort = await page.locator('#e-ort').textContent(); if (!ort.includes('0.500000, -29.000000')) fail(label + ': Koordinaten im Kopf fehlen: ' + ort);
  await page.screenshot({ path: path.join(out, `${label}-ergebnis.png`), fullPage: true });
  await page.locator('.verlauf > summary').click(); await page.screenshot({ path: path.join(out, `${label}-verlauf.png`), fullPage: true });
  // Gespeicherte öffnen (keine neue Ziehung)
  const s1 = await page.locator('#verlauf code').nth(2).textContent();
  await page.getByRole('button', { name: 'Neue Konstellation' }).click();
  await page.locator('#gesp-liste button').first().click();
  await page.locator('#ergebnis:not([hidden])').waitFor();
  const s1b = await page.locator('#verlauf code').nth(2).textContent(); if (s1 !== s1b) fail(label + ': geöffnete Konstellation weicht ab');
  // Export
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.getByRole('button', { name: 'Paket (ZIP)' }).click()]);
  const zipPath = path.join(out, `${label}.zip`); await dl.saveAs(zipPath);
  if (fs.statSync(zipPath).size < 10000) fail(label + ': ZIP zu klein');
  if (errors.length) fail(label + ': Browserfehler ' + errors.join(' | '));
  const sx = await page.evaluate(() => { const w = window.innerWidth; return [...document.querySelectorAll('body *')].filter((el) => !el.closest('.leaflet-container') && el.getBoundingClientRect().right > w + 1).map((el) => el.tagName + '.' + el.className + ' ' + Math.round(el.getBoundingClientRect().right)).slice(0, 5); }); if (sx.length) fail(label + ': horizontales Überlaufen: ' + sx.join(', '));
  results.push(`${label}: ok (${name}, S1 ${s1.slice(0, 12)}…)`);
  await ctx.close();
}
try {
  await run('server-desktop', `http://127.0.0.1:${port}/`, { width: 1280, height: 900 });
  await run('server-mobil', `http://127.0.0.1:${port}/`, { width: 360, height: 740 });
  await run('statisch-desktop', `http://127.0.0.1:${sport}/?offline`, { width: 1280, height: 900 });
  await run('statisch-mobil', `http://127.0.0.1:${sport}/?offline`, { width: 360, height: 740 });
} catch (e) { fail(String(e.stack || e)); }
await browser.close(); srv.kill(); staticSrv.close();
console.log(results.join('\n'));
process.exit(results.some((r) => r.startsWith('FEHLER')) ? 1 : 0);
