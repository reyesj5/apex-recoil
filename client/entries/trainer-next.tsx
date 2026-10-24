import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { createI18n, documentLocale, loadCatalog } from '@/lib/i18n';
import { TrainerApp } from '@/trainer/trainer-app';

// The rebuilt trainer, previewed at /next, /next/ru and /next/zh-CN until it replaces the current
// pages (docs/ui-migration-plan.md, Phase 2). The server sets the page's language on <html>; its
// catalog loads first (English is bundled). A prerendered page (server/prerender.mjs) is hydrated, a
// bare shell (pnpm dev) rendered.
const locale = documentLocale();
const root = document.getElementById('root')!;

void loadCatalog(locale).then((catalog) => {
  const app = (
    <StrictMode>
      <TrainerApp i18n={createI18n(locale, catalog)} locale={locale} />
    </StrictMode>
  );
  if (root.hasChildNodes()) hydrateRoot(root, app);
  else createRoot(root).render(app);
});
