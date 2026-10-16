'use client'

import { TriangleAlert } from 'lucide-react'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { deleteAccountAction } from './actions'

export function DeleteAccount({ email, paying = false }: { email: string; paying?: boolean }) {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const matches = typed.trim().toLowerCase() === email.toLowerCase()

  return (
    <section
      aria-labelledby="delete"
      className="rounded-lg border border-hairline bg-surface p-4 md:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-[52ch]">
          <h2 id="delete" className="subheading text-ink">
            Delete your account
          </h2>
          <p className="mt-1 text-ink-muted">
            Removes your sign-in and deletes your dynamic codes. Static codes you downloaded keep
            working.
          </p>
        </div>
        {open ? null : (
          <Button onClick={() => setOpen(true)} className="shrink-0">
            Delete account…
          </Button>
        )}
      </div>

      {open ? (
        <form
          className="mt-5 flex flex-col gap-4 border-t border-hairline pt-5"
          onSubmit={(e) => {
            e.preventDefault()
            start(async () => {
              const r = await deleteAccountAction()
              if (r.ok) window.location.href = '/?account=deleted'
              else setError(r.error)
            })
          }}
        >
          <div className="flex gap-3 rounded-md border-[1.5px] border-scan-fail p-4 text-ink">
            <TriangleAlert
              aria-hidden="true"
              size={20}
              strokeWidth={1.75}
              className="mt-[3px] shrink-0"
            />
            <p>
              <strong className="font-bold">
                Printed dynamic codes will stop opening your links
              </strong>{' '}
              and show “not active” instead. This can’t be undone. Export your data first if you
              want a copy.
              {paying ? ' Your paid plan ends now and you won’t be charged again.' : null}
            </p>
          </div>
          <TextField
            label="Type your email to confirm"
            hint={email}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            autoFocus
          />
          <div className="flex flex-wrap gap-3">
            <Button type="submit" variant="danger" disabled={pending || !matches}>
              {pending ? 'Deleting…' : 'Delete my account and codes'}
            </Button>
            <Button
              onClick={() => {
                setOpen(false)
                setTyped('')
                setError(null)
              }}
            >
              Cancel
            </Button>
          </div>
          {error ? (
            <p role="alert" className="body-small text-ink">
              {error}
            </p>
          ) : null}
        </form>
      ) : null}
    </section>
  )
}
