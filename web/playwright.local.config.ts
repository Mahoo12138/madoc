import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// This machine has newer Chromium builds than the pinned Playwright expects, so
// the bundled revision is missing. Point at an installed build instead of
// downloading one. Remove once `playwright install` has been run.
const candidates = ['chromium-1234', 'chromium-1223', 'chromium-1208'];
const executablePath = candidates
  .map((build) =>
    join(homedir(), 'AppData', 'Local', 'ms-playwright', build, 'chrome-win64', 'chrome.exe'),
  )
  .find((path) => existsSync(path));

export default defineConfig({
  testDir: './e2e',
  // Playwright clears the output dir on every start, and accumulated traces
  // trip this environment's bulk-delete guard. Use a fresh dir per run.
  outputDir:
    process.env.MADOC_PW_OUT ??
    `test-results-local-${process.hrtime.bigint().toString()}`,
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'retain-on-failure',
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node scripts/start-e2e.mjs',
    url: 'http://127.0.0.1:3100/healthz',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});