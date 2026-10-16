import { isValidEmail, type RateLimiter } from '@qrfinity/core'
import { proWaitlist, type Database } from '@qrfinity/db'
import { ServiceError } from './errors'
import { rateKey, retryMessage } from './rate-limit'

/** Adds an address to the Pro waitlist. Joining twice is not an error; the reply is the same. */
export async function joinWaitlist(
  db: Database,
  limiter: RateLimiter,
  rateSecret: string,
  input: { email: string; visitor: string },
): Promise<void> {
  const email = input.email.trim().toLowerCase()
  if (!isValidEmail(email) || email.length > 254)
    throw new ServiceError('Check your email address.', 'invalid')
  const r = await limiter.hit(await rateKey(rateSecret, 'waitlist', input.visitor), 10, 3600)
  if (!r.ok) throw new ServiceError(retryMessage(r.retryAfterSeconds), 'rate_limited')
  await db.insert(proWaitlist).values({ email }).onConflictDoNothing()
}
