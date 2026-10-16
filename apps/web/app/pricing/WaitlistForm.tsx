'use client'

import { useState, useTransition } from 'react'
import { track } from '@/lib/analytics'
import { Turnstile } from '@/components/Turnstile'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { joinWaitlistAction } from './actions'

export function WaitlistForm({ siteKey }: { siteKey?: string }) {
  const [email, setEmail] = useState('')
  const [token, setToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  // Load the bot check only once someone starts filling in the form, so it doesn't slow the page.
  const [engaged, setEngaged] = useState(false)
  const [pending, start] = useTransition()

  if (done) {
    return (
      <p role="status" className="rounded-lg bg-mint p-4 text-ink">
        You’re on the list. We’ll email you once when Pro launches, and that’s all.
      </p>
    )
  }

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onFocus={() => setEngaged(true)}
      onSubmit={(e) => {
        e.preventDefault()
        start(async () => {
          setError(null)
          const r = await joinWaitlistAction({ email, token })
          if (r.ok) {
            setDone(true)
            track('pro_waitlist_joined', {})
          } else setError(r.error)
        })
      }}
    >
      <TextField
        label="Your email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={error ?? undefined}
        hint="One email when Pro launches. No newsletter."
      />
      {engaged ? <Turnstile siteKey={siteKey} onToken={setToken} /> : null}
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? 'Adding you…' : 'Tell me when Pro launches'}
      </Button>
    </form>
  )
}
