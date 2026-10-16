import type { LinkStatus } from '@qrfinity/core'
import { StatusPill } from '@/components/dashboard/StatusPill'
import { shortLinkFor } from '@/lib/short-link'
import { ActionButton } from './ActionButton'
import { clearFlagAction, disableCodeAction, restoreCodeAction } from './actions'
import { codeTarget } from '@/lib/code-target'

export type AdminCode = {
  id: string
  name: string
  slug: string | null
  destination: string | null
  /** For a contact card code (no destination), its details. */
  content?: { type: string; fields: unknown } | null
  status: LinkStatus
  riskStatus?: string
  riskDetail?: string | null
  disabledReason?: string | null
  createdAt?: Date
}

const fmt = new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium' })

/** Name, status and destination: the first cell of a code row. Leave the badge out when a Status column shows it. */
export function CodeSummary({ code, badge = true }: { code: AdminCode; badge?: boolean }) {
  return (
    <div className="min-w-[16rem]">
      <p className="flex flex-wrap items-center gap-2">
        <span className="font-bold text-ink">{code.name}</span>
        {badge ? <StatusPill status={code.status} /> : null}
        {code.riskStatus === 'flagged' ? (
          <span className="label rounded-pill border-[1.5px] border-scan-fail px-2 text-ink">
            Flagged
          </span>
        ) : null}
      </p>
      <p className="break-all text-ink-muted">→ {codeTarget(code)}</p>
      {code.disabledReason ? (
        <p className="text-ink-muted">Turned off: {code.disabledReason}</p>
      ) : null}
    </div>
  )
}

export function ShortLink({ slug }: { slug: string | null }) {
  return slug ? (
    <span className="mono whitespace-nowrap text-evergreen">
      {shortLinkFor(slug).replace(/^https?:\/\//, '')}
    </span>
  ) : (
    <span className="text-ink-muted">–</span>
  )
}

export function CodeActions({ code }: { code: AdminCode }) {
  return (
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
  )
}

export const STATUS_LABEL: Record<LinkStatus, string> = {
  active: 'Live',
  paused: 'Paused',
  disabled: 'Turned off',
}

export const formatDate = (d: Date | null | undefined) => (d ? fmt.format(d) : '–')
