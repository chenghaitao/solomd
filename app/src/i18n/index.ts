/**
 * App-level i18n. Lightweight: no library, just a translations map + a
 * reactive `t()` function driven by the settings store's `language` field.
 *
 * The dictionaries are code-split: only English — where every lookup ends up
 * anyway — is bundled with the app, and the other 13 locales are their own
 * chunks, fetched when that language is actually selected. Together they were
 * ~1.1 MB of the entry chunk, so every user parsed 14 languages on cold start
 * to display one.
 */
import { computed, effectScope, shallowRef, watch } from 'vue';
import { useSettingsStore } from '../stores/settings';
import { en, type I18n } from './en';

export const LANGS = [
  'en',
  'zh',
  'ja',
  'ko',
  'de',
  'fr',
  'es',
  'pt',
  'it',
  'pl',
  'nl',
  'tr',
  'sv',
  'uk',
] as const;
export type Lang = (typeof LANGS)[number];

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (LANGS as readonly string[]).includes(value);
}

/** One dynamic import per locale — Vite turns each into its own chunk. */
const loaders: Record<Lang, () => Promise<I18n>> = {
  en: () => Promise.resolve(en),
  zh: () => import('./zh').then((m) => m.zh),
  ja: () => import('./ja').then((m) => m.ja),
  ko: () => import('./ko').then((m) => m.ko),
  de: () => import('./de').then((m) => m.de),
  fr: () => import('./fr').then((m) => m.fr),
  es: () => import('./es').then((m) => m.es),
  pt: () => import('./pt').then((m) => m.pt),
  it: () => import('./it').then((m) => m.it),
  pl: () => import('./pl').then((m) => m.pl),
  nl: () => import('./nl').then((m) => m.nl),
  tr: () => import('./tr').then((m) => m.tr),
  sv: () => import('./sv').then((m) => m.sv),
  uk: () => import('./uk').then((m) => m.uk),
};

const loaded = new Map<Lang, I18n>([['en', en]]);
// The active dictionary. `shallowRef` because a dictionary is written once and
// never mutated — only its identity changes when the language does.
const activeDict = shallowRef<I18n>(en);

/** Last requested language, so a slow chunk cannot win a race against a newer pick. */
let requested: Lang = 'en';

/**
 * Load `lang`'s dictionary (idempotent) and make it current while it is still
 * the language the user wants. Safe to call before the app is mounted.
 */
export async function loadLocale(lang: Lang): Promise<void> {
  requested = lang;
  let next = loaded.get(lang);
  if (!next) {
    try {
      next = await loaders[lang]();
    } catch {
      // A locale chunk that fails to load must not leave the UI stringless —
      // English (and then the raw key) is the documented fallback anyway.
      next = en;
    }
    loaded.set(lang, next);
  }
  if (requested === lang) activeDict.value = next;
}

let watcherInstalled = false;

export function useI18n() {
  const settings = useSettingsStore();

  // `useI18n()` runs in ~60 components. A watcher per call would mean 60
  // identical watchers, and the first one would be disposed with whichever
  // component happened to call it first — so: one detached scope, installed once.
  if (!watcherInstalled) {
    watcherInstalled = true;
    effectScope(true).run(() => {
      watch(() => settings.language, (lang) => void loadLocale(isLang(lang) ? lang : 'en'), {
        immediate: true,
      });
    });
  }

  const dict = computed(() => activeDict.value);

  function lookup(d: any, parts: string[]): string | undefined {
    let cur: any = d;
    for (const p of parts) {
      if (cur == null) return undefined;
      cur = cur[p];
    }
    return typeof cur === 'string' ? cur : undefined;
  }

  function t(key: string, params?: Record<string, string | number>): string {
    const parts = key.split('.');
    // v4.3.5: try active language first, then fall back to English, then to
    // the raw key. Previously missing keys returned the key itself, which
    // made any partially-translated feature look broken in non-en/zh locales.
    // The English fallback means new strings ship in 14 langs immediately
    // (as English) and the proper translations can land in the next minor.
    let str = lookup(dict.value, parts) ?? lookup(en, parts) ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      }
    }
    return str;
  }

  return { t, lang: computed(() => settings.language) };
}
