'use server'

import { headers } from 'next/headers'
import { getDb } from '@/lib/server/db'
import { env } from '@/lib/server/env'
import { ServiceError } from '@/lib/server/errors'
import { PostgresRateLimiter } from '@/lib/server/rate-limit'
import { verifyTurnstile } from '@/lib/server/turnstile'
import { joinWaitlist } from '@/lib/server/waitlist'

export async function joinWaitlistAction(input: { email: string; token: string | null }) {
  if (!(await verifyTurnstile(input.token)))
    return { ok: false as const, error: 'Please complete the check that you’re not a robot.' }
  const h = await headers()
  const visitor = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? 'unknown'
  try {
    const db = getDb()
    await joinWaitlist(db, new PostgresRateLimiter(db), env.rateLimitSecret, {
      email: input.email,
      visitor,
    })
    return { ok: true as const }
  } catch (e) {
    if (e instanceof ServiceError) return { ok: false as const, error: e.message }
    console.error(e)
    return { ok: false as const, error: 'We couldn’t add you just now. Please try again.' }
  }
}
