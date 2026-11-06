// Baut die Online-Abhängigkeiten (Bild- und Werkziehung) aus der Konfiguration – für Node und Browser gleich.
import { makeOnlineDraw } from './online.js';
import { metProvider } from './online/met.js';
import { aicProvider } from './online/aic.js';
import { gutenbergProvider } from './online/gutenberg.js';

export const ONLINE_DEFAULTS = { enabled: true, budgetMs: 12000, maxTries: 12, images: ['met', 'aic'], texts: ['gutenberg'], textLanguages: ['de'] };

// opts: { fetchImpl, headers, fetchImage (Node: lädt und prüft die Bilddatei), loadIndex (Gutenberg-Index), rewrite (URL-Umschreibung für einen Textproxy), nowMs }
export function makeOnline(cfgIn = {}, opts = {}) {
  const cfg = { ...ONLINE_DEFAULTS, ...cfgIn };
  if (cfg.enabled === false) return null;
  const ctx = { fetchImpl: opts.fetchImpl || globalThis.fetch.bind(globalThis), headers: opts.headers, fetchImage: opts.fetchImage || null };
  const imgProviders = { met: () => metProvider(opts.met), aic: () => aicProvider(opts.aic) };
  const imageProviders = cfg.images.map((k) => imgProviders[k]?.()).filter(Boolean);
  const imageDraw = imageProviders.length ? makeOnlineDraw({ kind: 'image', providers: imageProviders, budgetMs: cfg.budgetMs, maxTries: cfg.maxTries, nowMs: opts.nowMs, ctx }) : null;
  const textCache = new Map();
  return function online(input = {}) {
    const languages = Array.isArray(input.text_languages) ? input.text_languages.filter((l) => /^[a-z]{2,3}$/.test(l)) : cfg.textLanguages;
    const key = languages.join(',');
    if (!textCache.has(key)) {
      const textProviders = cfg.texts.includes('gutenberg') && opts.loadIndex ? [gutenbergProvider({ languages, loadIndex: opts.loadIndex, rewrite: opts.rewrite, ...opts.gutenberg })] : [];
      textCache.set(key, textProviders.length ? makeOnlineDraw({ kind: 'text', providers: textProviders, budgetMs: cfg.budgetMs, maxTries: cfg.maxTries, nowMs: opts.nowMs, ctx }) : null);
    }
    return { image: imageDraw, text: textCache.get(key), languages, providers: { images: cfg.images, texts: cfg.texts } };
  };
}
