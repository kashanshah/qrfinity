import { ADVANCED_FEATURES, FEATURES, RELEASED_FEATURES, type Feature } from '@qrfinity/core'
import { adminContext } from '@/lib/server/context'
import { listFlags } from '@/lib/server/entitlements'
import { FlagForm } from './FlagForm'

const fmt = new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium', timeStyle: 'short' })
const RELEASED = new Set<Feature>(RELEASED_FEATURES)
const ADVANCED = new Set<Feature>(ADVANCED_FEATURES)

export default async function AdminFlags() {
  const { db } = await adminContext()
  const flags = await listFlags(db)
  const unreleased = (Object.keys(FEATURES) as Feature[]).filter((f) => !RELEASED.has(f))
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="heading text-ink">Feature flags</h1>
        <p className="mt-1 max-w-[72ch] text-ink-muted">
          Features still being built. Switch one on for named accounts to test it, then for everyone
          to release it. Released features are on for everyone and aren’t listed here; advanced ones
          still count toward each account’s allowance of codes with advanced features.
        </p>
      </div>
      <ul className="divide-y divide-hairline rounded-lg border border-hairline bg-surface px-4">
        {unreleased.map((key) => {
          const f = flags.get(key)
          return (
            <li key={key} className="grid gap-3 py-4 md:grid-cols-[1fr_2fr]">
              <div>
                <p className="font-bold text-ink">{FEATURES[key]}</p>
                <p className="body-small text-ink-muted">
                  <code className="font-mono">{key}</code> ·{' '}
                  {ADVANCED.has(key) ? 'Advanced feature' : 'Planned'}
                  {f ? ` · changed ${fmt.format(f.updatedAt)}` : ''}
                </p>
              </div>
              <FlagForm flagKey={key} enabled={f?.enabled ?? false} emails={f?.emails ?? []} />
            </li>
          )
        })}
      </ul>
    </div>
  )
}
