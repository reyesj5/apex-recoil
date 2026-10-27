import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { createI18n, documentLocale, loadCatalog } from '@/lib/i18n';
import { ProgressApp } from '@/trainer/progress/progress-app';

// The Progress page at /progress, /ru/progress and /zh-CN/progress (docs/ui-migration-plan.md,
// Phase 2). The server sets the page's language on <html>; its catalog loads first (English is
// bundled). A prerendered page (server/prerender.ts) is
// hydrated, a bare shell (pnpm dev) rendered.
const locale = documentLocale();
const root = document.getElementById('root')!;

void loadCatalog(locale).then((catalog) => {
  const app = (
    <StrictMode>
      <ProgressApp i18n={createI18n(locale, catalog)} locale={locale} />
    </StrictMode>
  );
  if (root.hasChildNodes()) hydrateRoot(root, app);
  else createRoot(root).render(app);
});
