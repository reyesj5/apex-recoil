import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/studio/actions';
import { StudioApp } from '@/studio/studio-app';

// The Studio, the rebuilt Recoil Editor (docs/ui-migration-plan.md, Phase 3), previewed at
// /editor/next. A tool for the specs' maintainers: rendered in the browser, in English.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <StudioApp />
    </QueryClientProvider>
  </StrictMode>,
);
