import { FEATURES, FREE_FEATURES, PLAN_FEATURES, type Feature } from '@qrfinity/core'
import { adminContext } from '@/lib/server/context'
import { listFlags } from '@/lib/server/entitlements'
import { FlagForm } from './FlagForm'

const fmt = new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium', timeStyle: 'short' })
const FREE = new Set<Feature>(FREE_FEATURES)
const PRO = new Set<Feature>(PLAN_FEATURES.pro)

export default async function AdminFlags() {
  const { db } = await adminContext()
  const flags = await listFlags(db)
  const paid = (Object.keys(FEATURES) as Feature[]).filter((f) => !FREE.has(f))
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="heading text-ink">Feature flags</h1>
        <p className="mt-1 max-w-[72ch] text-ink-muted">
          Switch a paid or unreleased feature on for everyone or for named accounts, to test it
          before billing exists. Flags only add features. Free features are always on and aren’t
          listed here.
        </p>
      </div>
      <ul className="divide-y divide-hairline rounded-lg border border-hairline bg-surface px-4">
        {paid.map((key) => {
          const f = flags.get(key)
          return (
            <li key={key} className="grid gap-3 py-4 md:grid-cols-[1fr_2fr]">
              <div>
                <p className="font-bold text-ink">{FEATURES[key]}</p>
                <p className="body-small text-ink-muted">
                  <code className="font-mono">{key}</code> · {PRO.has(key) ? 'Pro' : 'Business'}
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
