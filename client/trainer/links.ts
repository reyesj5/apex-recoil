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

/**
 * The trainer's full address in a language, to open on another device: at the site's address
 * (site.json's siteUrl) when it is set, otherwise where `here` is
 */
export function trainerUrl(locale: Locale, siteUrl: string | undefined, here: string) {
  return new URL(trainerHref(locale), siteUrl ?? here).href;
}
