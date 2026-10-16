'use client'

import { useState, useTransition } from 'react'
import { setFreeCustomSlugsAction } from '../actions'

export function AllowanceForm({ value }: { value: number }) {
  const [n, setN] = useState(String(value))
  const [message, setMessage] = useState<string | null>(null)
  const [pending, start] = useTransition()
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        start(async () => {
          const r = await setFreeCustomSlugsAction(Number(n))
          setMessage(r.ok ? 'Saved.' : r.error)
        })
      }}
    >
      <label className="flex flex-col gap-1.5">
        <span className="label text-ink">Links per account</span>
        <input
          type="number"
          min={0}
          max={50}
          value={n}
          onChange={(e) => setN(e.target.value)}
          className="min-h-11 w-28 rounded-md border-[1.5px] border-control-border bg-surface px-3 text-ink"
        />
      </label>
      <button
        disabled={pending}
        className="button min-h-11 rounded-md border-[1.5px] border-control-border bg-surface px-5 text-ink hover:bg-surface-sunk disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Save'}
      </button>
      {message ? (
        <p role="status" className="body-small w-full text-ink-muted">
          {message}
        </p>
      ) : null}
    </form>
  )
}
