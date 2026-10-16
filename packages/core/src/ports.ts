/**
 * Interfaces for every outside service the app depends on. Each has one implementation
 * today; swapping hosts or vendors means writing another implementation, not changing callers.
 */
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
