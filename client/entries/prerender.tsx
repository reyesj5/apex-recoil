import { renderToString } from 'react-dom/server';
import { createI18n, loadCatalog, type Locale } from '@/lib/i18n';
import { setSite, site, type SiteJson } from '@/lib/site';
import { DocApp, docs, type DocPage, type ErrorPage } from '@/trainer/docs/doc-app';
import { PatternsApp } from '@/trainer/patterns/patterns-app';
import { ProgressApp } from '@/trainer/progress/progress-app';
import { TrainerApp } from '@/trainer/trainer-app';

// The pages rendered ahead of time (docs/ui-migration-plan.md, Phase 2.5), built as
// dist-ssr/prerender.mjs: the server (server/prerender.ts) renders each page in each language into
// HTML that the browser then hydrates, so the page shows before its JavaScript runs and search
// engines can read it. Settings and history stay in the browser, so the markup shows the defaults;
// the stored values load once the page has hydrated.

export type Page = 'train' | 'patterns' | 'progress' | DocPage | ErrorPage;

const apps = { train: TrainerApp, patterns: PatternsApp, progress: ProgressApp };
const isApp = (page: Page): page is keyof typeof apps => page in apps;

export interface Rendered {
  /** The markup for <div id="root"> */
  html: string;
  title: string;
  description: string;
}

/** A page's markup in one language, rendered with the site values the server runs with */
export async function render(page: Page, locale: Locale, siteJson: SiteJson): Promise<Rendered> {
  const i18n = createI18n(locale, await loadCatalog(locale));
  // Rendering is synchronous from here, so these values hold for this page alone
  setSite(siteJson);
  if (isApp(page)) {
    const App = apps[page];
    const html = renderToString(<App i18n={i18n} locale={locale} />);
    const [heading, description] =
      page === 'train'
        ? [i18n.t('meta.title'), i18n.t('meta.description')]
        : [i18n.t(`${page}.title`), i18n.t(`${page}.description`)];
    return { html, title: `${site.name} · ${heading}`, description };
  }
  // A document of docs/ (in English, titled by its first heading), or the page for an unknown address
  // or a server error
  const html = renderToString(<DocApp i18n={i18n} page={page} />);
  if (page === 'not-found' || page === 'error') {
    const key = page === 'error' ? 'serverError' : 'notFound';
    return { html, title: `${site.name} · ${i18n.t(`${key}.title`)}`, description: i18n.t(`${key}.text`) };
  }
  return { html, title: `${site.name} · ${docs[page].title}`, description: docs[page].description };
}
