import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Gallery } from '@/gallery/gallery';

// The component gallery at /next/components: every component of the new UI in its states.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Gallery />
  </StrictMode>,
);
