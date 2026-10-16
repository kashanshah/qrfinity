import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests run the real stack locally: the Next.js app, the redirect Worker and
 * the edge-api Worker (wrangler, sharing local KV), on a dedicated Postgres database.
 */
export const E2E_DB =
  process.env.E2E_DATABASE_URL ?? 'postgres://qrfinity:qrfinity@localhost:5432/qrfinity_e2e'
const READER_DB = E2E_DB.replace(/\/\/[^@]+@/, '//redirect_reader:redirect_reader@')

const appEnv = {
  DATABASE_URL: E2E_DB,
  BETTER_AUTH_SECRET: 'e2e-secret-e2e-secret-e2e-secret-e2e',
  BETTER_AUTH_URL: 'http://localhost:3000',
  DEV_MAILBOX: '1',
  TURNSTILE_DISABLED: '1',
  EDGE_API_URL: 'http://localhost:8788',
  EDGE_API_SECRET: 'dev-edge-secret',
  SHORT_LINK_ORIGIN: 'http://localhost:8787',
  ANALYTICS_BACKEND: 'postgres',
  SCAN_SINK_SECRET: 'dev-sink-secret',
  CRON_SECRET: 'dev-cron-secret',
  ADMIN_EMAILS: 'e2e-admin@example.com',
}

const wrangler = (pkg: string, port: number, inspector: number, vars: string) =>
  `pnpm --filter ${pkg} exec wrangler dev --port ${port} --inspector-port ${inspector} --persist-to ../../.wrangler/e2e-state ${vars}`

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: 'http://localhost:3000',
    acceptDownloads: true,
    // Use a preinstalled Chromium when one is provided (e.g. PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium).
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {},
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /dynamic/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testIgnore: /dynamic/ },
    { name: 'dynamic', use: { ...devices['Desktop Chrome'] }, testMatch: /dynamic/ },
  ],
  webServer: [
    {
      command: 'pnpm exec next start -p 3000',
      port: 3000,
      env: appEnv,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: wrangler('@qrfinity/edge-api', 8788, 9231, '--var EDGE_API_SECRET:dev-edge-secret'),
      port: 8788,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: wrangler(
        '@qrfinity/redirect',
        8787,
        9230,
        '--var SITE_ORIGIN:http://localhost:3000 --var SCAN_SINK_URL:http://localhost:3000/api/internal/scans --var SCAN_SINK_SECRET:dev-sink-secret',
      ),
      port: 8787,
      env: { CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: READER_DB },
      reuseExistingServer: !process.env.CI,
    },
  ],
})
