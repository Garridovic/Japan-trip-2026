import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  // GitHub's public runners have 4 CPUs; the default would use only 2 of them.
  workers: process.env.CI ? 4 : undefined,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    // Tests mock network requests with page.route(), which cannot see requests answered by a service worker.
    // Only tests/e2e/offline.spec.js turns service workers on.
    serviceWorkers: 'block',
    ...devices['Desktop Chrome']
  },
  webServer: {
    command: 'node tests/server.js',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  }
});
