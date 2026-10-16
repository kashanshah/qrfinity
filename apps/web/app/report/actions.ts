'use server'

import { headers } from 'next/headers'
import { getDb } from '@/lib/server/db'
import { env } from '@/lib/server/env'
import { ServiceError } from '@/lib/server/errors'
import { PostgresRateLimiter } from '@/lib/server/rate-limit'
import { createReport } from '@/lib/server/reports'
import { verifyTurnstile } from '@/lib/server/turnstile'

export async function submitReportAction(input: {
  reported: string
  reason: string
  details: string
  email: string
  token: string | null
}) {
  if (!(await verifyTurnstile(input.token)))
    return { ok: false as const, error: 'Please complete the check that you’re not a robot.' }
  const h = await headers()
  const visitor = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? 'unknown'
  try {
    const db = getDb()
    const r = await createReport(db, new PostgresRateLimiter(db), env.rateLimitSecret, {
      ...input,
      visitor,
      shortDomain: env.shortDomain,
    })
    return { ok: true as const, matched: r.matched }
  } catch (e) {
    if (e instanceof ServiceError) return { ok: false as const, error: e.message }
    console.error(e)
    return {
      ok: false as const,
      error: 'We couldn’t save your report. Please try again, or email us.',
    }
  }
}
