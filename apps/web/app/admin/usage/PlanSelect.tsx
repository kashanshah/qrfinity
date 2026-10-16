'use client'

import { useState, useTransition } from 'react'
import { setCloudflarePlanAction } from '../actions'

export function CloudflarePlanSelect({ plan }: { plan: 'free' | 'paid' }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <span className="inline-flex flex-col">
      <label className="flex items-center gap-2">
        <span className="label text-ink">Cloudflare plan</span>
        <select
          defaultValue={plan}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.value
            start(async () => {
              const r = await setCloudflarePlanAction(next)
              setError(r.ok ? null : r.error)
            })
          }}
          className="label min-h-9 rounded-md border-[1.5px] border-control-border bg-surface px-2 text-ink"
        >
          <option value="free">Workers Free</option>
          <option value="paid">Workers Paid</option>
        </select>
      </label>
      {error ? <span className="body-small text-ink">{error}</span> : null}
    </span>
  )
}
