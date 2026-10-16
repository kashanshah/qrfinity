import type { CheckIssue } from '@qrfinity/core'
import { TriangleAlert } from 'lucide-react'
import { ScanBadge, type ScanBadgeState } from './Badges'

export type ScanSummary = {
  state: ScanBadgeState
  /** Fail: cause and fix. Pass: minimum print size. */
  message: { text: string; strong?: string }
  warnings: CheckIssue[]
}

export function ScanResult({ summary, live = false }: { summary: ScanSummary; live?: boolean }) {
  return (
    <div className="flex flex-col gap-2" aria-live={live ? 'polite' : undefined}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <ScanBadge state={summary.state} />
        {summary.state !== 'checking' ? (
          <p className="body-small text-ink-muted">
            {summary.message.text}{' '}
            {summary.message.strong ? (
              <strong className="font-bold text-ink">{summary.message.strong}</strong>
            ) : null}
          </p>
        ) : null}
      </div>
      {summary.state !== 'checking' && summary.warnings.length ? (
        <ul className="flex flex-col gap-1.5">
          {summary.warnings.map((w) => (
            <li key={w.id} className="body-small flex gap-2 text-ink-muted">
              <TriangleAlert
                aria-label="Warning"
                size={16}
                strokeWidth={1.75}
                className="mt-[3px] shrink-0 text-ink"
              />
              <span>
                {w.message}{' '}
                {w.strong ? <strong className="font-bold text-ink">{w.strong}</strong> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
