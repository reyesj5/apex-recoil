import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Unit and component tests for client/ (pnpm test:unit). Server tests stay on node:test (pnpm test).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@', replacement: fileURLToPath(new URL('./client', import.meta.url)) },
      // shadcn/ui components import `cn` from "cn"; ours is configured with the design tokens
      { find: /^cn$/, replacement: fileURLToPath(new URL('./client/lib/utils.ts', import.meta.url)) },
    ],
  },
  test: {
    environment: 'jsdom',
    include: ['client/**/*.test.{ts,tsx}'],
    setupFiles: ['client/test/setup.ts'],
    restoreMocks: true,
  },
});
