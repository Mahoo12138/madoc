import { defineConfig, devices } from '@playwright/test';

// This suite owns the server process and data directory. Run separately from
// the normal suite, whose webServer must remain alive for every test.
export default defineConfig({
  testDir: './restart-tests',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: { baseURL: 'http://127.0.0.1:3100', trace: 'retain-on-failure', actionTimeout: 10_000 },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
