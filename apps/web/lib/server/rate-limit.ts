import { sha256Hex, type RateLimitResult, type RateLimiter } from '@qrfinity/core'
import { sql, type Database } from '@qrfinity/db'

/** Fixed-window counters in Postgres. Low volume (sign-ins, code changes), so one upsert per hit is fine. */
export class PostgresRateLimiter implements RateLimiter {
  constructor(private db: Database) {}

  async hit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const rows = await this.db.execute<{ count: number; window_start: Date }>(sql`
      insert into rate_limits (key, count, window_start) values (${key}, 1, now())
      on conflict (key) do update set
        count = case when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) then 1 else rate_limits.count + 1 end,
        window_start = case when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) then now() else rate_limits.window_start end
      returning count, window_start`)
    const row = rows[0]!
    if (row.count <= limit) return { ok: true }
    const resetAt = new Date(row.window_start).getTime() + windowSeconds * 1000
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)) }
  }
}

/** Hashes identifiers (emails, IPs) with a server secret, so rate-limit keys never hold raw values. */
export async function rateKey(secret: string, ...parts: string[]): Promise<string> {
  return (await sha256Hex(`${secret}:${parts.join(':')}`)).slice(0, 32)
}

/** Limits that a normal business never reaches. */
export const LIMITS = {
  createPerHour: { limit: 60, window: 3600 },
  createPerDay: { limit: 500, window: 86_400 },
  editPerHour: { limit: 300, window: 3600 },
  magicLinkPerEmail: { limit: 5, window: 3600 },
  magicLinkPerVisitor: { limit: 20, window: 3600 },
  linkCheckPerVisitor: { limit: 30, window: 3600 },
} as const

export function retryMessage(seconds: number): string {
  const minutes = Math.ceil(seconds / 60)
  return minutes >= 60
    ? `You’ve reached the limit for now. Try again in about ${Math.ceil(minutes / 60)} hours.`
    : `You’ve reached the limit for now. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`
}
