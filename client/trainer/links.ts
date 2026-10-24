import { localePaths, type Locale } from '@/lib/i18n';

// Where the trainer's pages are. The rebuilt trainer is previewed under /next (/next, /next/ru,
// /next/zh-CN, and /progress after each) until it replaces the current pages at /, /ru and /zh-CN.
// In the browser the prefix comes from the address; the prerender, which has no address, sets it
// for each page it renders.
let prefix = typeof location !== 'undefined' && location.pathname.startsWith('/next') ? '/next' : '';

/** The prefix the pages live under ('/next' while previewed, '' once they replace the current ones) */
export function setPathPrefix(value: string) {
  prefix = value;
}

/** The trainer in a language */
export function trainerHref(locale: Locale) {
  return prefix + (locale === 'en' && prefix ? '' : localePaths[locale]);
}

/** The Progress page in a language */
export function progressHref(locale: Locale) {
  return trainerHref(locale).replace(/\/$/, '') + '/progress';
}
