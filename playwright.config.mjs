// Böngészős tesztek (Playwright): a GitHub Actions minden közzététel előtt lefuttatja őket.
// Helyben: npm install, majd npm test.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173/',
    viewport: { width: 390, height: 844 },
    locale: 'hu-HU',
    browserName: 'chromium',
  },
  webServer: {
    command: 'node tests/serve.mjs',
    url: 'http://127.0.0.1:4173/',
    reuseExistingServer: !process.env.CI,
  },
});
