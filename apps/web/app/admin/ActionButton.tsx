'use client'

import { useState, useTransition } from 'react'

/**
 * A small admin button that runs a server action. With `ask`, it prompts for a reason first
 * (the reason is shown to the code owner and stored in the audit log).
 */
export function ActionButton({
  label,
  action,
  ask,
  confirmText,
  tone = 'secondary',
}: {
  label: string
  action: (reason: string) => Promise<{ ok: true } | { ok: false; error: string }>
  ask?: string
  confirmText?: string
  tone?: 'danger' | 'secondary'
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          let reason = ''
          if (ask) {
            const r = prompt(ask)
            if (r === null) return
            reason = r
          } else if (confirmText && !confirm(confirmText)) return
          start(async () => {
            setError(null)
            const res = await action(reason)
            if (!res.ok) setError(res.error)
          })
        }}
        className={`label min-h-9 rounded-md px-3 py-1.5 disabled:opacity-50 ${
          tone === 'danger'
            ? 'bg-scan-fail font-bold text-on-scan-fail hover:brightness-95'
            : 'border-[1.5px] border-control-border bg-surface text-ink hover:bg-surface-sunk'
        }`}
      >
        {pending ? '…' : label}
      </button>
      {error ? <span className="body-small text-ink">{error}</span> : null}
    </span>
  )
}
