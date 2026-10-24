import i18next, { type i18n } from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '@/locales/en.json';

// The trainer's text in English, Russian and Simplified Chinese: one catalog per locale in
// client/locales, extracted from the three trainer templates (views/index*.pug) and the strings in
// client/game.ts. Keys are typed from en.json, so t('stats.summary') is checked, and a test makes sure
// every locale has every key with the same placeholders and tags. Links inside a sentence are named
// tags (<faq>FAQ</faq>) that react-i18next's Trans fills with elements. The Studio stays in English.

export const locales = ['en', 'ru', 'zh-CN'] as const;
export type Locale = (typeof locales)[number];

/** Each language's name in that language, for the language switcher */
export const localeNames: Record<Locale, string> = { en: 'English', ru: 'Русский', 'zh-CN': '中文' };

/** Where each locale's trainer is served */
export const localePaths: Record<Locale, string> = { en: '/', ru: '/ru', 'zh-CN': '/zh-CN' };

/** A locale's texts by key, as in client/locales */
export type Catalog = Record<string, unknown>;

// English is bundled: it is the fallback for any text a locale lacks. The other catalogs load with the
// page that needs them, so a page carries its own language and English, not all three.
const catalogs: Record<Locale, () => Promise<Catalog>> = {
  en: () => Promise.resolve(en),
  ru: () => import('@/locales/ru.json').then((m) => m.default),
  'zh-CN': () => import('@/locales/zh-CN.json').then((m) => m.default),
};

/** A locale's catalog, for createI18n */
export function loadCatalog(locale: Locale): Promise<Catalog> {
  return catalogs[locale]();
}

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof en };
  }
}

/** The page's locale, from <html lang> (which the server sets), English for any other */
export function documentLocale(): Locale {
  const lang = document.documentElement.lang;
  return locales.find((locale) => locale === lang) ?? 'en';
}

/** The locale of a trainer path ('/ru' is Russian), English for any other */
export function localeFromPath(pathname: string): Locale {
  const first = pathname.split('/')[1];
  return locales.find((locale) => locale !== 'en' && locale === first) ?? 'en';
}

/**
 * An i18next instance for one locale and its catalog (loadCatalog), ready as soon as it returns, so
 * the prerendered page and the browser's first render produce the same text. Missing keys fall back
 * to English.
 */
export function createI18n(locale: Locale, catalog: Catalog = en): i18n {
  const instance = i18next.createInstance();
  void instance.use(initReactI18next).init({
    lng: locale,
    fallbackLng: 'en',
    resources: { en: { translation: en }, [locale]: { translation: catalog } },
    initAsync: false,
    // React escapes what it renders
    interpolation: { escapeValue: false },
  });
  return instance;
}
