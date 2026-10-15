import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.PORT ?? 3100)

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    acceptDownloads: true,
    // Use a preinstalled Chromium when one is provided (e.g. PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium).
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {},
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `pnpm exec next start -p ${port}`,
    port,
    reuseExistingServer: !process.env.CI,
  },
})
