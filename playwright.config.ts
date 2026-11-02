import { defineConfig, devices } from '@playwright/test';

const PORT = 8099;

// E2E runs the Expo web build in local mode (data in the browser's storage), so it needs no API
// server or database. Server-mode flows are covered by server/test.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 420, height: 860 },
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 420, height: 860 } } }],
  webServer: {
    command: `npx expo start --web --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    env: { EXPO_PUBLIC_STORAGE_MODE: 'local', CI: '1' },
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
