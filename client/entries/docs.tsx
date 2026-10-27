import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { createI18n, loadCatalog } from '@/lib/i18n';
import { DocApp, type DocPage } from '@/trainer/docs/doc-app';

// The privacy policy, the FAQ and the changelog at /privacy, /faq and /changelog
// (docs/ui-migration-plan.md, Phase 2.7), and the page for an unknown address. They are in English;
// the server names the page on #root (data-page). A prerendered page (server/prerender.ts) is
// hydrated, a bare shell (pnpm dev) rendered.
const root = document.getElementById('root')!;
const page = root.dataset.page as DocPage | 'not-found';

void loadCatalog('en').then((catalog) => {
  const app = (
    <StrictMode>
      <DocApp i18n={createI18n('en', catalog)} page={page} />
    </StrictMode>
  );
  if (root.hasChildNodes()) hydrateRoot(root, app);
  else createRoot(root).render(app);
});
