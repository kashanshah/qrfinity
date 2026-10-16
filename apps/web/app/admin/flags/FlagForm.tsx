'use client'

import { useState, useTransition } from 'react'
import { setFlagAction } from '../actions'

export function FlagForm({
  flagKey,
  enabled,
  emails,
}: {
  flagKey: string
  enabled: boolean
  emails: string[]
}) {
  const [on, setOn] = useState(enabled)
  const [list, setList] = useState(emails.join(', '))
  const [pending, start] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        start(async () => {
          const r = await setFlagAction(flagKey, on, list.split(/[\s,]+/))
          setMessage(r.ok ? 'Saved.' : r.error)
        })
      }}
    >
      <label className="flex items-center gap-2 text-ink">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => setOn(e.target.checked)}
          className="size-4 accent-evergreen"
        />
        On for everyone
      </label>
      <div className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor={`emails-${flagKey}`}>
          Accounts that get this feature
        </label>
        <input
          id={`emails-${flagKey}`}
          value={list}
          onChange={(e) => setList(e.target.value)}
          placeholder="Or only for these emails, comma separated"
          className="min-w-0 flex-1 rounded-md border-[1.5px] border-control-border bg-surface px-3 py-2 text-ink"
        />
        <button
          disabled={pending}
          className="label min-h-10 rounded-md border-[1.5px] border-control-border bg-surface px-4 font-bold text-ink hover:bg-surface-sunk disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
      </div>
      {message ? (
        <p role="status" className="body-small text-ink-muted">
          {message}
        </p>
      ) : null}
    </form>
  )
}
