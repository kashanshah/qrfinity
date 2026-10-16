import { env } from './env'

/** Verifies a Cloudflare Turnstile token. Disabled only with TURNSTILE_DISABLED=1 (local development and tests). */
export async function verifyTurnstile(token: string | null | undefined): Promise<boolean> {
  if (env.turnstileDisabled) return true
  const secret = env.turnstileSecret
  if (!secret) {
    console.error(
      'TURNSTILE_SECRET_KEY is not set; refusing sign-ups. Set it, or TURNSTILE_DISABLED=1 for local development.',
    )
    return false
  }
  if (!token) return false
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ secret, response: token }),
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) return false
  const data = (await res.json()) as { success?: boolean }
  return data.success === true
}
