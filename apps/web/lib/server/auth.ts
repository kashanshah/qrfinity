import { account, eq, session, user, verification } from '@qrfinity/db'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { nextCookies } from 'better-auth/next-js'
import { magicLink } from 'better-auth/plugins'
import { getDb } from './db'
import { env } from './env'
import { getMailer, magicLinkEmail } from './mailer'
import { LIMITS, PostgresRateLimiter, rateKey, retryMessage } from './rate-limit'
import { verifyTurnstile } from './turnstile'

function createAuth() {
  const db = getDb()
  const limiter = new PostgresRateLimiter(db)
  const google = env.google

  return betterAuth({
    baseURL: env.appUrl,
    secret: env.authSecret,
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: { user, session, account, verification },
    }),
    // No raw IP storage: sessions keep no IP address, and Better Auth's IP-based limiter is off
    // (sign-in limits below use hashed keys instead).
    advanced: { ipAddress: { disableIpTracking: true } },
    rateLimit: { enabled: false },
    telemetry: { enabled: false },
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    user: { additionalFields: { role: { type: 'string', defaultValue: 'user', input: false } } },
    databaseHooks: {
      session: {
        create: {
          // Suspended accounts can't sign in. Their codes keep working unless disabled one by one.
          before: async (s) => {
            const [u] = await db
              .select({ suspendedAt: user.suspendedAt })
              .from(user)
              .where(eq(user.id, s.userId))
            if (u?.suspendedAt)
              throw new APIError('FORBIDDEN', {
                message: 'This account is suspended. Contact us if you think this is a mistake.',
              })
          },
        },
      },
    },
    account: { accountLinking: { enabled: true, trustedProviders: ['google'] } },
    socialProviders: google
      ? {
          google: {
            clientId: google.clientId,
            clientSecret: google.clientSecret,
            prompt: 'select_account',
          },
        }
      : {},
    plugins: [
      magicLink({
        expiresIn: 600,
        sendMagicLink: async ({ email, url }) => {
          await getMailer().send(magicLinkEmail(email, url))
        },
      }),
      nextCookies(),
    ],
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== '/sign-in/magic-link') return
        const email = String((ctx.body as { email?: unknown })?.email ?? '').toLowerCase()
        if (!(await verifyTurnstile(ctx.headers?.get('x-turnstile-token')))) {
          throw new APIError('BAD_REQUEST', {
            message: 'Please complete the check that you’re not a robot.',
          })
        }
        const visitor = ctx.headers?.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
        const checks = [
          limiter.hit(
            await rateKey(env.rateLimitSecret, 'ml-email', email),
            LIMITS.magicLinkPerEmail.limit,
            LIMITS.magicLinkPerEmail.window,
          ),
          limiter.hit(
            await rateKey(env.rateLimitSecret, 'ml-visitor', visitor),
            LIMITS.magicLinkPerVisitor.limit,
            LIMITS.magicLinkPerVisitor.window,
          ),
        ]
        for (const r of await Promise.all(checks)) {
          if (!r.ok)
            throw new APIError('TOO_MANY_REQUESTS', { message: retryMessage(r.retryAfterSeconds) })
        }
      }),
    },
  })
}

type Auth = ReturnType<typeof createAuth>
const g = globalThis as unknown as { __qrfinityAuth?: Auth }

export function getAuth(): Auth {
  g.__qrfinityAuth ??= createAuth()
  return g.__qrfinityAuth
}
