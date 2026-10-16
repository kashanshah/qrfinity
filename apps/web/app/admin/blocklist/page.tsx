import { listBlocklist } from '@/lib/server/admin'
import { adminContext } from '@/lib/server/context'
import { ActionButton } from '../ActionButton'
import { removeBlockAction } from '../actions'
import { AddBlockForm } from './AddBlockForm'

const KIND_LABEL = {
  domain: 'Domain (and subdomains)',
  tld: 'Top-level domain',
  contains: 'Address contains',
} as const

export default async function AdminBlocklist() {
  const { db } = await adminContext()
  const rows = await listBlocklist(db)
  return (
    <div className="flex flex-col gap-6">
      <h1 className="heading text-ink">Blocklist</h1>
      <p className="max-w-[72ch] text-ink-muted">
        New and edited codes can’t point to these. Existing codes that match are flagged at their
        next re-check, not turned off automatically. Other URL shorteners and raw IP addresses are
        always refused.
      </p>
      <AddBlockForm />
      <ul className="divide-y divide-hairline rounded-lg border border-hairline bg-surface px-4">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <p className="mono text-ink">{r.value}</p>
              <p className="body-small text-ink-muted">
                {KIND_LABEL[r.kind]}
                {r.reason ? ` · ${r.reason}` : ''} · added by{' '}
                {r.createdBy === 'system' ? 'default list' : r.createdBy}
              </p>
            </div>
            <ActionButton
              label="Remove"
              action={removeBlockAction.bind(null, r.id)}
              confirmText={`Remove ${r.value} from the blocklist?`}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}
