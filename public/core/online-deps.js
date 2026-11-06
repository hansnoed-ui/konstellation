// Baut die Online-Abhängigkeiten (Bild- und Werkziehung) aus der Konfiguration – für Node und Browser gleich.
import { makeOnlineDraw } from './online.js';
import { metProvider } from './online/met.js';
import { aicProvider } from './online/aic.js';
import { gutenbergProvider } from './online/gutenberg.js';
import { clevelandProvider } from './online/cleveland.js';
import { europeanaProvider } from './online/europeana.js';
import { exoplanetsLiveProvider, gaiaProvider, sbdbProvider } from './online/astro.js';

export const ONLINE_DEFAULTS = { enabled: true, budgetMs: 12000, maxTries: 12, images: ['met', 'aic', 'cma', 'europeana'], texts: ['gutenberg'], textLanguages: ['de'], astro: ['exoplanets-live', 'gaia', 'sbdb'], keys: {} };
export const ASTRO_SOURCES = { local: 'Exoplaneten (Bestand)', 'exoplanets-live': 'Exoplaneten live (NASA Exoplanet Archive)', gaia: 'Sterne, Gaia DR3 (ESA, 1,8 Mrd. Quellen)', sbdb: 'Asteroiden und Kometen (JPL Small-Body Database)' };

// opts: { fetchImpl, headers, fetchImage (Node: lädt und prüft die Bilddatei), loadIndex (Gutenberg-Index), rewrite (URL-Umschreibung für den Durchreicher im Browser: Gutenberg und die Astronomie-Archive senden keine CORS-Kopfzeilen), nowMs }
export function makeOnline(cfgIn = {}, opts = {}) {
  const cfg = { ...ONLINE_DEFAULTS, ...cfgIn };
  if (cfg.enabled === false) return null;
  const ctx = { fetchImpl: opts.fetchImpl || globalThis.fetch.bind(globalThis), headers: opts.headers, fetchImage: opts.fetchImage || null };
  const keys = { ...(cfg.keys || {}), ...(opts.keys || {}) };
  const imgProviders = { met: () => metProvider(opts.met), aic: () => aicProvider(opts.aic), cma: () => clevelandProvider({ rewrite: opts.rewrite, ...opts.cma }), europeana: () => (keys.europeana ? europeanaProvider({ key: keys.europeana, ...opts.europeana }) : null) };
  const imageProviders = cfg.images.map((k) => imgProviders[k]?.()).filter(Boolean);
  const astroProviders = { 'exoplanets-live': () => exoplanetsLiveProvider({ rewrite: opts.rewrite, ...opts.nasa }), gaia: () => gaiaProvider({ rewrite: opts.rewrite, ...opts.gaia }), sbdb: () => sbdbProvider({ rewrite: opts.rewrite, ...opts.sbdb }) };
  const astroDraws = new Map();
  const astroFor = (source) => {
    if (!source || source === 'local' || !cfg.astro.includes(source) || !astroProviders[source]) return null;
    if (!astroDraws.has(source)) astroDraws.set(source, makeOnlineDraw({ kind: 'astro', providers: [astroProviders[source]()], budgetMs: cfg.budgetMs, maxTries: Math.min(cfg.maxTries, 6), nowMs: opts.nowMs, ctx }));
    return astroDraws.get(source);
  };
  const imageDraw = imageProviders.length ? makeOnlineDraw({ kind: 'image', providers: imageProviders, budgetMs: cfg.budgetMs, maxTries: cfg.maxTries, nowMs: opts.nowMs, ctx }) : null;
  const textCache = new Map();
  return function online(input = {}) {
    const languages = Array.isArray(input.text_languages) ? input.text_languages.filter((l) => /^[a-z]{2,3}$/.test(l)) : cfg.textLanguages;
    const key = languages.join(',');
    if (!textCache.has(key)) {
      const textProviders = cfg.texts.includes('gutenberg') && opts.loadIndex ? [gutenbergProvider({ languages, loadIndex: opts.loadIndex, rewrite: opts.rewrite, ...opts.gutenberg })] : [];
      textCache.set(key, textProviders.length ? makeOnlineDraw({ kind: 'text', providers: textProviders, budgetMs: cfg.budgetMs, maxTries: cfg.maxTries, nowMs: opts.nowMs, ctx }) : null);
    }
    const astroSource = typeof input.astro_source === 'string' && cfg.astro.includes(input.astro_source) ? input.astro_source : 'local';
    return { image: imageDraw, text: textCache.get(key), astro: astroFor(astroSource), astroSource, languages, providers: { images: imageProviders.map((p) => p.id), texts: cfg.texts, astro: cfg.astro } };
  };
}
