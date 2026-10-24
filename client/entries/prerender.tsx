import { renderToString } from 'react-dom/server';
import { createI18n, loadCatalog, type Locale } from '@/lib/i18n';
import { setSite, site, type SiteJson } from '@/lib/site';
import { setPathPrefix } from '@/trainer/links';
import { ProgressApp } from '@/trainer/progress/progress-app';
import { TrainerApp } from '@/trainer/trainer-app';

// The new pages rendered ahead of time (docs/ui-migration-plan.md, Phase 2.5), built as
// dist-ssr/prerender.mjs: the server (server/prerender.mjs) renders each page in each language into
// HTML that the browser then hydrates, so the page shows before its JavaScript runs and search
// engines can read it. Settings and history stay in the browser, so the markup shows the defaults;
// the stored values load once the page has hydrated.

export type Page = 'train' | 'progress';

export interface Rendered {
  /** The markup for <div id="root"> */
  html: string;
  title: string;
  description: string;
}

/**
 * A page's markup in one language, rendered with the site values the server runs with and the path
 * prefix its pages live under ('/next' while previewed)
 */
export async function render(page: Page, locale: Locale, siteJson: SiteJson, prefix: string): Promise<Rendered> {
  const i18n = createI18n(locale, await loadCatalog(locale));
  // Rendering is synchronous from here, so these values hold for this page alone
  setSite(siteJson);
  setPathPrefix(prefix);
  const App = page === 'train' ? TrainerApp : ProgressApp;
  const html = renderToString(<App i18n={i18n} locale={locale} />);
  const [heading, description] =
    page === 'train'
      ? [i18n.t('meta.title'), i18n.t('meta.description')]
      : [i18n.t('progress.title'), i18n.t('progress.description')];
  return { html, title: `${site.name} · ${heading}`, description };
}
