'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { recheckStudyAction } from '../actions'

/** Re-checks every link that's due, a few at a time, showing progress. */
export function RecheckButton({ due }: { due: number }) {
  const router = useRouter()
  const [state, setState] = useState<string | null>(null)
  const [running, setRunning] = useState(false)

  async function run() {
    setRunning(true)
    let total = 0
    for (;;) {
      const r = await recheckStudyAction()
      if (!r.ok) {
        setState(r.error)
        break
      }
      total += r.checked
      setState(`Checked ${total}; ${r.remaining} to go…`)
      if (r.checked === 0 || r.remaining === 0) {
        setState(`Done: checked ${total}.`)
        break
      }
    }
    setRunning(false)
    router.refresh()
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={running || due === 0}
        onClick={run}
        className="button min-h-11 rounded-md border-[1.5px] border-control-border bg-surface px-5 text-ink disabled:cursor-not-allowed disabled:opacity-50"
      >
        {running ? 'Re-checking…' : `Re-check ${due} due`}
      </button>
      <span className="body-small text-ink-muted" aria-live="polite">
        {state ??
          (due
            ? 'New links, and failures last checked over a day ago.'
            : 'Nothing is due. Failures can be re-checked a day after their last check.')}
      </span>
    </div>
  )
}
