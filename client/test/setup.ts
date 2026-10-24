import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './msw';

// jsdom has no ResizeObserver; Radix measures with it (slider thumbs, scroll areas)
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  // Absent in the Node environment, where the prerender's tests run
  globalThis.localStorage?.clear();
});
afterAll(() => server.close());
