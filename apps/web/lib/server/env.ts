/**
 * Server configuration, read lazily so `next build` works without secrets.
 * See .env.example for every variable.
 */

const read = (name: string) => {
  const v = process.env[name]
  return v && v.trim() ? v.trim() : undefined
}

function required(name: string): string {
  const v = read(name)
  if (!v) throw new Error(`Missing environment variable ${name}. See apps/web/.env.example.`)
  return v
}

export const env = {
  get databaseUrl() {
    return required('DATABASE_URL')
  },
  get appUrl() {
    return read('BETTER_AUTH_URL') ?? read('NEXT_PUBLIC_APP_URL') ?? 'http://localhost:3000'
  },
  get authSecret() {
    return required('BETTER_AUTH_SECRET')
  },
  get google() {
    const clientId = read('GOOGLE_CLIENT_ID')
    const clientSecret = read('GOOGLE_CLIENT_SECRET')
    return clientId && clientSecret ? { clientId, clientSecret } : null
  },
  get resendApiKey() {
    return read('RESEND_API_KEY')
  },
  get emailFrom() {
    return read('EMAIL_FROM') ?? 'QRfinity <hello@mail.qrfinity.com>'
  },
  /** Development and tests: keep emails in memory and expose them at /api/dev/mailbox. */
  get devMailbox() {
    return read('DEV_MAILBOX') === '1'
  },
  get turnstileSecret() {
    return read('TURNSTILE_SECRET_KEY')
  },
  get turnstileDisabled() {
    return read('TURNSTILE_DISABLED') === '1'
  },
  get edgeApi() {
    const url = read('EDGE_API_URL')
    const secret = read('EDGE_API_SECRET')
    return url && secret ? { url, secret } : null
  },
  get shortDomain() {
    return read('SHORT_DOMAIN') ?? 'qrfinity.link'
  },
  /** Overrides https://{shortDomain} for links shown and encoded, e.g. http://localhost:8787 in development. */
  get shortLinkOrigin() {
    return read('SHORT_LINK_ORIGIN')
  },
  get analyticsBackend(): 'analytics-engine' | 'postgres' | 'none' {
    const v = read('ANALYTICS_BACKEND')
    return v === 'analytics-engine' || v === 'postgres' ? v : 'none'
  },
  get cloudflareAnalytics() {
    const accountId = read('CF_ACCOUNT_ID')
    const token = read('CF_ANALYTICS_TOKEN')
    return accountId && token ? { accountId, token } : null
  },
  get scanSinkSecret() {
    return read('SCAN_SINK_SECRET')
  },
  get cronSecret() {
    return read('CRON_SECRET')
  },
  /** IndexNow key (8–128 letters, digits or dashes). Served at /indexnow-key.txt. */
  get indexNowKey() {
    const k = read('INDEXNOW_KEY')
    return k && /^[A-Za-z0-9-]{8,128}$/.test(k) ? k : null
  },
  get webRiskApiKey() {
    return read('WEB_RISK_API_KEY')
  },
  /** Comma-separated emails that are admins even without the admin role in the database. */
  get adminEmails(): string[] {
    return (read('ADMIN_EMAILS') ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  },
  /** Lookups the scheduled re-check may spend per run (one run a day by default). */
  get recheckBudget() {
    return Number(read('RECHECK_DAILY_BUDGET') ?? 3000) || 3000
  },
  get abuseEmail() {
    return read('ABUSE_EMAIL') ?? 'abuse@qrfinity.com'
  },
  get rateLimitSecret() {
    return read('RATE_LIMIT_SECRET') ?? read('BETTER_AUTH_SECRET') ?? 'dev-only-rate-limit-secret'
  },
}
