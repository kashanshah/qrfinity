'use client'

import { useState, useTransition } from 'react'
import { Turnstile } from '@/components/Turnstile'
import { Button } from '@/components/ui/Button'
import { TextArea, TextField } from '@/components/ui/Field'
import { OptionGroup } from '@/components/ui/OptionGroup'
import { submitReportAction } from './actions'

export function ReportForm({
  initial,
  reasons,
  siteKey,
  abuseEmail,
}: {
  initial: string
  reasons: { value: string; label: string }[]
  siteKey?: string
  abuseEmail: string
}) {
  const [reported, setReported] = useState(initial)
  const [reason, setReason] = useState('phishing')
  const [details, setDetails] = useState('')
  const [email, setEmail] = useState('')
  const [token, setToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [pending, start] = useTransition()

  if (done) {
    return (
      <div role="status" className="rounded-lg bg-mint p-4 text-ink md:p-6">
        <p className="subheading">Thank you. We’ve received your report.</p>
        <p className="mt-2">
          We review reports quickly. If the code breaks our rules, we turn it off and people who
          scan it see a warning instead.
        </p>
      </div>
    )
  }

  return (
    <form
      className="flex flex-col gap-6"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        start(async () => {
          setError(null)
          const r = await submitReportAction({ reported, reason, details, email, token })
          if (r.ok) setDone(true)
          else setError(r.error)
        })
      }}
    >
      <TextField
        label="The QR code’s link"
        hint="Scan the code and copy the address it opens, or type what’s printed under it, like qrfinity.link/aB3xK9q."
        value={reported}
        onChange={(e) => setReported(e.target.value)}
        maxLength={500}
      />
      <OptionGroup
        label="What’s wrong?"
        value={reason}
        onChange={setReason}
        columns="grid-cols-1 sm:grid-cols-2"
        options={reasons}
      />
      <TextArea
        label="Details (optional)"
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        maxLength={2000}
        hint="Where you saw the code and what happened."
      />
      <TextField
        label="Your email (optional)"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        hint="Only if you’d like us to follow up. We never share it with the code’s owner."
      />
      <Turnstile siteKey={siteKey} onToken={setToken} />
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? 'Sending…' : 'Send report'}
      </Button>
      <p className="body-small text-ink-muted" role={error ? 'alert' : undefined}>
        {error ?? (
          <>
            You can also email{' '}
            <a href={`mailto:${abuseEmail}`} className="text-evergreen underline">
              {abuseEmail}
            </a>
            .
          </>
        )}
      </p>
    </form>
  )
}
