import type { LinkStatus } from '@qrfinity/core'
import { CirclePause, TriangleAlert } from 'lucide-react'

/** Shown only when a code is not live. Active codes need no badge. */
export function StatusPill({ status }: { status: LinkStatus }) {
  if (status === 'active') return null
  return status === 'paused' ? (
    <span className="label inline-flex items-center gap-1 rounded-pill border-[1.5px] border-control-border bg-surface px-2.5 py-0.5 text-ink">
      <CirclePause aria-hidden="true" size={14} strokeWidth={1.75} />
      Paused
    </span>
  ) : (
    <span className="label inline-flex items-center gap-1 rounded-pill bg-scan-fail px-2.5 py-0.5 font-bold text-on-scan-fail">
      <TriangleAlert aria-hidden="true" size={14} strokeWidth={1.75} />
      Turned off
    </span>
  )
}
