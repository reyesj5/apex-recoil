import i18next, { type i18n } from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '@/locales/en.json';
import ru from '@/locales/ru.json';
import zhCN from '@/locales/zh-CN.json';

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

export const resources = {
  en: { translation: en },
  ru: { translation: ru },
  'zh-CN': { translation: zhCN },
} as const;

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof en };
  }
}

/** The locale of a trainer path ('/ru' is Russian), English for any other */
export function localeFromPath(pathname: string): Locale {
  const first = pathname.split('/')[1];
  return locales.find((locale) => locale !== 'en' && locale === first) ?? 'en';
}

/**
 * An i18next instance for one locale, ready as soon as it returns (the catalogs are bundled), so the
 * prerendered page and the browser's first render produce the same text. Missing keys fall back to
 * English.
 */
export function createI18n(locale: Locale): i18n {
  const instance = i18next.createInstance();
  void instance.use(initReactI18next).init({
    lng: locale,
    fallbackLng: 'en',
    resources,
    initAsync: false,
    // React escapes what it renders
    interpolation: { escapeValue: false },
  });
  return instance;
}
