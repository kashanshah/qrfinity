'use client'

import { Send } from 'lucide-react'
import { useState, useTransition } from 'react'
import { submitIndexNowAction } from '../actions'

export function IndexNowPanel({ ready }: { ready: boolean }) {
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [pending, start] = useTransition()
  const [which, setWhich] = useState<'all' | 'changed' | null>(null)
  const submit = (all: boolean) => {
    setWhich(all ? 'all' : 'changed')
    start(async () => setResult(await submitIndexNowAction(all)))
  }
  const button =
    'button inline-flex min-h-11 items-center gap-2 rounded-md px-5 disabled:cursor-not-allowed disabled:opacity-50'
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={!ready || pending}
          onClick={() => submit(true)}
          className={`${button} bg-evergreen text-on-evergreen hover:bg-evergreen-deep`}
        >
          <Send aria-hidden="true" size={18} strokeWidth={1.75} />
          {pending && which === 'all' ? 'Sending…' : 'Submit all pages'}
        </button>
        <button
          type="button"
          disabled={!ready || pending}
          onClick={() => submit(false)}
          className={`${button} border-[1.5px] border-control-border bg-surface text-ink hover:bg-surface-sunk`}
        >
          {pending && which === 'changed' ? 'Sending…' : 'Submit pages changed in the last 2 days'}
        </button>
      </div>
      {result ? (
        <p
          role="status"
          className={`rounded-md px-4 py-3 text-ink ${result.ok ? 'bg-mint' : 'border-[1.5px] border-scan-fail bg-surface'}`}
        >
          {result.message}
        </p>
      ) : null}
    </div>
  )
}
