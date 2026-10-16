'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { deleteAccountAction } from './actions'

export function DeleteAccount({ email }: { email: string }) {
  const [typed, setTyped] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  return (
    <section className="flex flex-col gap-3 rounded-lg border-[1.5px] border-scan-fail bg-surface p-4 md:p-6">
      <h2 className="subheading text-ink">Delete your account</h2>
      <p className="text-ink-muted">
        This removes your email and sign-in, and deletes all your dynamic codes:{' '}
        <strong className="font-bold text-ink">printed copies will stop opening your links</strong>{' '}
        and show “not active” instead. Static codes you downloaded keep working; they never depended
        on us. Export your data first if you want a copy.
      </p>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          start(async () => {
            const r = await deleteAccountAction()
            if (r.ok) window.location.href = '/?account=deleted'
            else setError(r.error)
          })
        }}
      >
        <TextField
          label={`Type your email (${email}) to confirm`}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
        />
        <Button
          type="submit"
          disabled={pending || typed.trim().toLowerCase() !== email.toLowerCase()}
        >
          {pending ? 'Deleting…' : 'Delete my account and codes'}
        </Button>
        {error ? (
          <p role="alert" className="body-small text-ink">
            {error}
          </p>
        ) : null}
      </form>
    </section>
  )
}
