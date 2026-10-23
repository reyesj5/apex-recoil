import { defineConfig, devices } from '@playwright/test';

// End-to-end scenarios against the built app: pnpm build && pnpm test:e2e. e2e/server.mjs runs the
// app on throwaway data; the second instance has analytics turned on for the consent scenarios.
// The tests share each server's data, so they run one at a time.
export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    ...devices['Desktop Chrome'],
    channel: 'chrome',
    viewport: { width: 1440, height: 900 },
    baseURL: 'http://127.0.0.1:3210',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'node e2e/server.mjs',
      url: 'http://127.0.0.1:3210/api/specs',
      env: { PORT: '3210' },
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'node e2e/server.mjs',
      url: 'http://127.0.0.1:3211/api/specs',
      env: { PORT: '3211', E2E_ANALYTICS: '1' },
      reuseExistingServer: !process.env.CI,
    },
  ],
});
