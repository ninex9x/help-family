import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:3011', headless: true, trace: 'retain-on-failure' },
  webServer: {
    command: 'node scripts/test-server.js',
    url: 'http://127.0.0.1:3011/api/health',
    reuseExistingServer: false,
  },
});
