import { proWaitlist, type Database } from '@qrfinity/db'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PostgresRateLimiter } from '@/lib/server/rate-limit'
import { joinWaitlist } from '@/lib/server/waitlist'
import { freshDb } from './helpers'

let db: Database
beforeAll(async () => {
  db = await freshDb()
})
afterAll(() => db.$client.end())

describe('Pro waitlist', () => {
  it('stores one lower-cased row per address and rejects bad input', async () => {
    const limiter = new PostgresRateLimiter(db)
    await joinWaitlist(db, limiter, 's', { email: ' Amira@Example.com ', visitor: 'a' })
    await joinWaitlist(db, limiter, 's', { email: 'amira@example.com', visitor: 'a' })
    expect(await db.select().from(proWaitlist)).toMatchObject([{ email: 'amira@example.com' }])
    await expect(
      joinWaitlist(db, limiter, 's', { email: 'not-an-email', visitor: 'a' }),
    ).rejects.toThrow('Check your email')
  })

  it('rate-limits one visitor', async () => {
    const limiter = new PostgresRateLimiter(db)
    for (let i = 0; i < 10; i++)
      await joinWaitlist(db, limiter, 's', { email: `p${i}@example.com`, visitor: 'busy' })
    await expect(
      joinWaitlist(db, limiter, 's', { email: 'p10@example.com', visitor: 'busy' }),
    ).rejects.toThrow('limit')
  })
})
