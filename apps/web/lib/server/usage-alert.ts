import {
  METRIC_LABELS,
  PLAN_LIMITS,
  type CloudflareUsage,
  type Mailer,
  type UsageMetric,
} from '@qrfinity/core'
import { appSettings, eq, type Database } from '@qrfinity/db'
import { usageAlertEmail } from './emails'
import { getCloudflarePlan } from './settings'

/** Shares of a free-plan daily limit that send an email, each at most once a day. */
export const ALERT_LEVELS = [50, 80] as const

const utcDay = (d: Date) => d.toISOString().slice(0, 10)
const sentKey = (day: string) => `usage_alert:${day}`

/**
 * Hourly: emails the admins when today's Cloudflare usage first passes 50%, then 80%, of any
 * free-plan daily limit, so there's time to upgrade before scans start failing. Does nothing on the
 * paid plan (no daily limits) or when Cloudflare's numbers aren't available.
 */
export async function checkUsageAlert(deps: {
  db: Database
  cf: CloudflareUsage | null
  mailer: Mailer
  adminEmails: string[]
  siteUrl: string
  now?: Date
}) {
  const now = deps.now ?? new Date()
  const plan = await getCloudflarePlan(deps.db)
  if (plan !== 'free') return { sent: 0, reason: 'paid plan' as const }
  if (!deps.cf) return { sent: 0, reason: 'no Cloudflare credentials' as const }
  if (!deps.adminEmails.length) return { sent: 0, reason: 'no ADMIN_EMAILS' as const }

  const today = utcDay(now)
  const [day] = (await deps.cf.daily(today, today)).filter((d) => d.date === today)
  const limits = PLAN_LIMITS.free.limits
  const rows = (Object.keys(limits) as UsageMetric[])
    .map((m) => ({ label: METRIC_LABELS[m], used: day?.[m] ?? 0, limit: limits[m] }))
    .sort((a, b) => b.used / b.limit - a.used / a.limit)
  const pct = rows.length ? (rows[0]!.used / rows[0]!.limit) * 100 : 0
  const level = [...ALERT_LEVELS].reverse().find((l) => pct >= l)
  if (!level) return { sent: 0, pct, reason: 'under 50%' as const }

  const [row] = await deps.db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, sentKey(today)))
  const already = typeof row?.value === 'number' ? row.value : 0
  if (already >= level) return { sent: 0, pct, reason: 'already sent' as const }

  // Only the metrics worth mentioning: the ones at 50% or more.
  const shown = rows.filter((r) => (r.used / r.limit) * 100 >= ALERT_LEVELS[0])
  for (const to of deps.adminEmails)
    await deps.mailer.send(usageAlertEmail({ to, pct, rows: shown, siteUrl: deps.siteUrl }))
  await deps.db
    .insert(appSettings)
    .values({ key: sentKey(today), value: level, updatedBy: 'system' })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: level, updatedAt: now } })
  return { sent: deps.adminEmails.length, pct, level }
}
