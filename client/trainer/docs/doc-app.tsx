import type { i18n } from 'i18next';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import changelog from '../../../docs/changelog.md?html';
import faq from '../../../docs/faq.md?html';
import privacy from '../../../docs/privacy-policy.md?html';
import { ConsentPrompt, useAnalyticsStart } from '../consent';
import { useMediaQuery } from '../hooks';
import { LegalFooter } from '../legal-footer';
import { trainerHref } from '../links';
import { TopBar } from '../top-bar';

// The documents of docs/ that players read, as pages of the app (docs/ui-migration-plan.md, Phase
// 2.7): converted to HTML at build time, in English only, between the top bar and the legal footer.
// The page for an unknown address (404) and the one for a server error have the same frame.

export const docs = { privacy, faq, changelog };
export type DocPage = keyof typeof docs;
/** The pages that answer instead of a document: an unknown address (404) and a server error (5xx) */
export type ErrorPage = 'not-found' | 'error';

export function DocApp({ i18n, page }: { i18n: i18n; page: DocPage | ErrorPage }) {
  return (
    <I18nextProvider i18n={i18n}>
      <TooltipProvider>
        <Doc page={page} />
      </TooltipProvider>
    </I18nextProvider>
  );
}

function Doc({ page }: { page: DocPage | ErrorPage }) {
  const wide = useMediaQuery('(min-width: 48rem)');
  useAnalyticsStart();

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar locale="en" page="doc" />
      <main className="mx-auto flex w-full max-w-200 flex-1 flex-col gap-10 px-5 pt-6 pb-8">
        {page === 'not-found' || page === 'error' ? (
          <Problem page={page} />
        ) : (
          <article
            className="prose max-w-none prose-invert prose-headings:scroll-mt-4 prose-headings:text-text prose-h1:type-page-title prose-h2:type-panel-title prose-h3:type-heading prose-p:text-text-secondary prose-a:text-volt prose-a:underline-offset-2 hover:prose-a:text-volt-bright prose-strong:text-text prose-code:font-mono prose-code:text-text prose-code:before:content-none prose-code:after:content-none prose-ol:text-text-secondary prose-ul:text-text-secondary prose-li:marker:text-text-muted prose-table:block prose-table:overflow-x-auto prose-table:text-13 prose-th:text-text prose-td:text-text-secondary prose-hr:border-outline prose-thead:border-divider prose-tr:border-outline"
            // Our own documents, converted at build time
            dangerouslySetInnerHTML={{ __html: docs[page].html }}
          />
        )}
        <LegalFooter className="mt-auto" />
      </main>
      <ConsentPrompt sheet={!wide} />
    </div>
  );
}

// The answer to an address the app doesn't have (sent with the 404 status) or to a request the server
// failed (with its 5xx status)
function Problem({ page }: { page: ErrorPage }) {
  const { t } = useTranslation();
  const key = page === 'error' ? 'serverError' : 'notFound';
  return (
    <section className="flex flex-col items-start gap-3">
      <h1 className="m-0 type-page-title">{t(`${key}.title`)}</h1>
      <p className="m-0 text-text-secondary">{t(`${key}.text`)}</p>
      <Button asChild className="mt-2">
        <a href={trainerHref('en')}>{t('notFound.home')}</a>
      </Button>
    </section>
  );
}
