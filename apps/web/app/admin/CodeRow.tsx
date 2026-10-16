import type { LinkStatus } from '@qrfinity/core'
import { StatusPill } from '@/components/dashboard/StatusPill'
import { shortLinkFor } from '@/lib/short-link'
import { ActionButton } from './ActionButton'
import { clearFlagAction, disableCodeAction, restoreCodeAction } from './actions'

export type AdminCode = {
  id: string
  name: string
  slug: string | null
  destination: string | null
  status: LinkStatus
  riskStatus?: string
  riskDetail?: string | null
  disabledReason?: string | null
  createdAt?: Date
}

const fmt = new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium' })

export function CodeRow({ code, ownerEmail }: { code: AdminCode; ownerEmail: string | null }) {
  return (
    <div className="grid gap-2 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-ink">{code.name}</span>
          <StatusPill status={code.status} />
          {code.riskStatus === 'flagged' ? (
            <span className="label rounded-pill border-[1.5px] border-scan-fail px-2 text-ink">
              Flagged
            </span>
          ) : null}
          {code.slug ? (
            <span className="mono text-evergreen">
              {shortLinkFor(code.slug).replace(/^https?:\/\//, '')}
            </span>
          ) : null}
        </p>
        <p className="body-small break-all text-ink">→ {code.destination}</p>
        <p className="body-small text-ink-muted">
          {ownerEmail ?? 'unknown owner'}
          {code.createdAt ? ` · created ${fmt.format(code.createdAt)}` : ''}
          {code.riskDetail ? ` · ${code.riskDetail}` : ''}
          {code.disabledReason ? ` · turned off: ${code.disabledReason}` : ''}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {code.status === 'disabled' ? (
          <ActionButton
            label="Restore"
            action={restoreCodeAction.bind(null, code.id)}
            confirmText="Turn this code back on?"
          />
        ) : (
          <ActionButton
            label="Disable"
            tone="danger"
            ask="Why are you turning this code off? The owner sees this reason."
            action={disableCodeAction.bind(null, code.id)}
          />
        )}
        {code.riskStatus === 'flagged' && code.status !== 'disabled' ? (
          <ActionButton label="Looks fine" action={clearFlagAction.bind(null, code.id)} />
        ) : null}
      </div>
    </div>
  )
}
