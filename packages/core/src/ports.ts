/**
 * Interfaces for every outside service the app depends on. Each has one implementation
 * today; swapping hosts or vendors means writing another implementation, not changing callers.
 */
import type { DailyRollup } from './analytics/rollup'
import type { ReportScope, ScanReport } from './analytics/report'
import type { LinkRecord } from './links/record'
import type { ReputationResult } from './links/screening'

/** Pushes link records to the edge (Cloudflare KV via the edge-api Worker today). */
export interface EdgeSync {
  put(domain: string, slug: string, record: LinkRecord): Promise<void>
  remove(domain: string, slug: string): Promise<void>
}

/** Reads scan analytics (Analytics Engine today; Postgres in local development). */
export interface ScanAnalytics {
  report(scope: ReportScope, days?: number): Promise<ScanReport>
  codeTotals(ownerId: string, days?: number): Promise<Map<string, number>>
  /** Scans of one code since a moment (within the store's retention window), for scan limits. */
  scanCount(codeId: string, since: Date): Promise<number>
  /** Per-code totals for one complete UTC day (YYYY-MM-DD), for the nightly roll-up. */
  dailyRollup(day: string): Promise<DailyRollup[]>
  /** True when real data is available (false for a sample/unconfigured backend). */
  readonly live: boolean
}

export type Email = { to: string; subject: string; text: string; html: string }

export interface Mailer {
  send(email: Email): Promise<void>
}

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number }

export interface RateLimiter {
  hit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult>
}

/** URL reputation (Google Web Risk today). */
export interface UrlReputation {
  check(url: string): Promise<ReputationResult>
  readonly configured: boolean
}

/** Daily Cloudflare usage for the account that runs qrfinity.link (admin Usage page). */
export interface CloudflareUsage {
  /** One row per UTC day from `from` to `to` inclusive (YYYY-MM-DD). */
  daily(from: string, to: string): Promise<import('./usage').UsageDay[]>
}

/** Subscriptions and payments (Stripe today, with Stripe Tax). */
export interface Billing {
  /** Creates the provider's customer record for a user. Returns its id. */
  createCustomer(input: { userId: string; email: string }): Promise<string>
  /** A hosted checkout page for a new subscription. */
  checkoutUrl(input: {
    customerId: string
    plan: import('./billing').PaidPlan
    interval: import('./billing').BillingInterval
    successUrl: string
    cancelUrl: string
    /** Free days before the first charge (first plan only). A card is still collected. */
    trialDays?: number
  }): Promise<string>
  /** A hosted page where the customer changes plan, updates their card, sees invoices or cancels. */
  portalUrl(customerId: string, returnUrl: string): Promise<string>
  /** The current state of a subscription, or null when it isn't one of our plans. */
  subscription(id: string): Promise<import('./billing').SubscriptionState | null>
  /** Subscriptions created by a finished checkout (for syncing without waiting for the webhook). */
  checkoutSubscription(
    checkoutId: string,
  ): Promise<{ customerId: string; subscriptionId: string } | null>
  /** Ids of the customer's subscriptions that haven't ended. */
  openSubscriptions(customerId: string): Promise<string[]>
  /** Ends a subscription now (account deletion). */
  cancelNow(subscriptionId: string): Promise<void>
  /**
   * Verifies a webhook and says which subscription to re-read, or null for events we ignore.
   * Throws when the signature is wrong.
   */
  webhook(rawBody: string, signature: string): Promise<{ subscriptionId: string } | null>
}

/**
 * Private file storage (an S3 or S3-compatible bucket such as Cloudflare R2 today; local disk in
 * development). Files are never public: the app reads them back for signed-in admins only.
 */
export interface FileStore {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>
  get(key: string): Promise<{ body: ArrayBuffer; contentType: string } | null>
  remove(key: string): Promise<void>
  /** False when no storage is set up: uploads are refused, the rest of the app works. */
  readonly configured: boolean
}
