import { localePaths, type Locale } from '@/lib/i18n';

// Where the trainer's pages are: /, /ru and /zh-CN, with /patterns and /progress after each.

/** The trainer in a language */
export function trainerHref(locale: Locale) {
  return localePaths[locale];
}

/** The Patterns page in a language */
export function patternsHref(locale: Locale) {
  return trainerHref(locale).replace(/\/$/, '') + '/patterns';
}

/** The Progress page in a language */
export function progressHref(locale: Locale) {
  return trainerHref(locale).replace(/\/$/, '') + '/progress';
}
