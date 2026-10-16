'use client'

import { PLANS } from '@qrfinity/core'
import { useState, useTransition } from 'react'
import { setUserPlanAction } from '../actions'

export function PlanSelect({
  userId,
  email,
  plan,
}: {
  userId: string
  email: string
  plan: string
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <span className="inline-flex flex-col">
      <label className="sr-only" htmlFor={`plan-${userId}`}>
        Plan for {email}
      </label>
      <select
        id={`plan-${userId}`}
        defaultValue={plan}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value
          start(async () => {
            setError(null)
            const r = await setUserPlanAction(userId, next)
            if (!r.ok) setError(r.error)
          })
        }}
        className="label min-h-9 rounded-md border-[1.5px] border-control-border bg-surface px-2 text-ink"
      >
        {PLANS.map((p) => (
          <option key={p} value={p}>
            {p === 'free' ? 'Free' : p === 'pro' ? 'Pro' : 'Business'}
          </option>
        ))}
      </select>
      {error ? <span className="body-small text-ink">{error}</span> : null}
    </span>
  )
}
