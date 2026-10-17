'use client'

import { Mail } from 'lucide-react'
import { useState } from 'react'
import { markSignInPending, track } from '@/lib/analytics'
import { TrackEvent } from '@/components/TrackEvent'
import { Turnstile } from '@/components/Turnstile'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { authClient } from '@/lib/auth-client'

export function LoginForm({
  next,
  google,
  siteKey,
  linkError,
}: {
  next: string
  google: boolean
  siteKey?: string
  linkError?: string
}) {
  const [email, setEmail] = useState('')
  const [token, setToken] = useState<string | null>(null)
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(linkError ?? null)

  async function sendLink(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter your email address, like you@example.com.')
      track('sign_in_failed', { method: 'email', reason: 'invalid_email' })
      return
    }
    if (siteKey && !token) {
      setError('Please complete the check that you’re not a robot.')
      track('sign_in_failed', { method: 'email', reason: 'bot_check' })
      return
    }
    setState('sending')
    const res = await authClient.signIn.magicLink({
      email: email.trim(),
      callbackURL: next,
      errorCallbackURL: `/login?error=link&next=${encodeURIComponent(next)}`,
      fetchOptions: { headers: token ? { 'x-turnstile-token': token } : {} },
    })
    if (res.error) {
      setState('idle')
      setError(res.error.message ?? 'We couldn’t send the link. Try again in a minute.')
      track('sign_in_failed', {
        method: 'email',
        reason: res.error.status === 429 ? 'rate_limited' : 'send_failed',
      })
      return
    }
    setState('sent')
    markSignInPending('email')
    track('sign_in_requested', { method: 'email' })
  }

  if (state === 'sent') {
    return (
      <div role="status" className="rounded-lg bg-mint p-4 text-ink md:p-6">
        <p className="subheading">Check your email</p>
        <p className="mt-2">
          We sent a sign-in link to <strong className="font-bold">{email.trim()}</strong>. It works
          once and expires in 10 minutes.
        </p>
        <button
          type="button"
          className="label mt-4 rounded-sm text-evergreen underline"
          onClick={() => setState('idle')}
        >
          Use a different email
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {linkError ? (
        <TrackEvent name="sign_in_failed" props={{ method: 'email', reason: 'link_invalid' }} />
      ) : null}
      <form onSubmit={sendLink} noValidate className="flex flex-col gap-4">
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={error ?? undefined}
        />
        <Turnstile siteKey={siteKey} onToken={setToken} />
        <Button
          type="submit"
          variant="primary"
          disabled={state === 'sending'}
          icon={<Mail aria-hidden="true" size={18} strokeWidth={1.75} />}
        >
          {state === 'sending' ? 'Sending…' : 'Email me a sign-in link'}
        </Button>
      </form>
      {google ? (
        <>
          <div className="flex items-center gap-3 text-ink-muted" aria-hidden="true">
            <span className="h-px flex-1 bg-hairline" />
            <span className="label">or</span>
            <span className="h-px flex-1 bg-hairline" />
          </div>
          <Button
            onClick={() => {
              markSignInPending('google')
              track('sign_in_requested', { method: 'google' })
              void authClient.signIn.social({ provider: 'google', callbackURL: next })
            }}
            icon={
              // Google's standard "G", unaltered, as its sign-in branding guidelines require.
              // eslint-disable-next-line @next/next/no-img-element -- static SVG asset
              <img src="/third-party/google-g.svg" alt="" width={18} height={18} />
            }
          >
            Continue with Google
          </Button>
        </>
      ) : null}
      <p className="body-small text-ink-muted">
        We use your email only to sign you in. No newsletters, no marketing.
      </p>
    </div>
  )
}
