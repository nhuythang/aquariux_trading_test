import { defineConfig, devices } from '@playwright/test';
import { STORAGE_STATE, baseUrl } from './src/config/env';

/**
 * Projects:
 * - unit:   pure domain logic, no browser.
 * - setup:  logs in once and saves the session (token in localStorage).
 * - live:   real demo backend; depends on setup.
 * - mocked: backend responses rewritten with page.route; still needs a session
 *           to load the app, but never places a real order.
 *
 * All tests share one demo account, so execution is serial.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: baseUrl,
    viewport: { width: 1600, height: 900 },
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'unit',
      testMatch: /unit\/.*\.spec\.ts/,
    },
    {
      name: 'setup',
      testDir: './src/fixtures',
      testMatch: /auth\.setup\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1600, height: 900 } },
    },
    {
      name: 'live',
      grep: /@live/,
      testIgnore: /unit\//,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1600, height: 900 }, storageState: STORAGE_STATE },
    },
    {
      name: 'mocked',
      grep: /@mocked/,
      testIgnore: /unit\//,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1600, height: 900 }, storageState: STORAGE_STATE },
    },
  ],
});
