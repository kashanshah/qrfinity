import { Crown, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

/**
 * Where an account stands with advanced features, for the crown that marks them:
 * - `paid`: on a plan (or trial, or admin grant): no crown;
 * - `available`: free account with places left: crown at half strength;
 * - `full`: free account that has used its places: crown at full strength.
 */
export type AdvancedAccess = 'paid' | 'available' | 'full'

export type AdvancedUsage = { used: number; allowance: number; plan: string }

export function advancedAccess(u: AdvancedUsage): AdvancedAccess {
  if (u.plan !== 'free') return 'paid'
  return u.used < u.allowance ? 'available' : 'full'
}

const codesWord = (n: number) => `${n} ${n === 1 ? 'code' : 'codes'}`

/** The crown beside an advanced feature. Shown to free accounts only. */
export function AdvancedMark({
  access,
  used,
  allowance,
  size = 18,
}: {
  access: AdvancedAccess
  used: number
  allowance: number
  size?: number
}) {
  if (access === 'paid') return null
  const label =
    access === 'available'
      ? `Advanced feature: free on ${codesWord(allowance)}, ${used} used`
      : `Advanced feature: you’ve used your free ${codesWord(allowance)}`
  return (
    <span
      title={label}
      className={`inline-flex shrink-0 items-center align-middle text-ink ${access === 'available' ? 'opacity-50' : ''}`}
    >
      <Crown aria-hidden="true" size={size} strokeWidth={1.75} />
      <span className="sr-only">{label}</span>
    </span>
  )
}

/**
 * A section of the code page for one advanced feature. When the feature can't be used on this
 * code (free places used up), its controls are faded and inert, and the upgrade note stays clear.
 */
export function AdvancedSection({
  id,
  icon: Icon,
  title,
  description,
  access,
  used,
  allowance,
  blocked,
  what,
  children,
}: {
  id: string
  icon: LucideIcon
  title: string
  description: ReactNode
  access: AdvancedAccess
  used: number
  allowance: number
  /** True when this code can't take the feature: no free place left and it uses none yet. */
  blocked: boolean
  /** For the upgrade note, e.g. "add redirect rules to this code". */
  what: string
  children: ReactNode
}) {
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-4 rounded-lg border border-hairline bg-surface p-4 md:p-6"
    >
      <div className="flex items-start gap-3">
        <Icon
          aria-hidden="true"
          size={20}
          strokeWidth={1.75}
          className={`mt-1 shrink-0 text-evergreen ${blocked ? 'opacity-50' : ''}`}
        />
        <div className="min-w-0">
          <h2 id={id} className="subheading flex items-center gap-2 text-ink">
            <span className={blocked ? 'opacity-50' : ''}>{title}</span>
            <AdvancedMark access={access} used={used} allowance={allowance} />
          </h2>
          <div className={`mt-1 max-w-[65ch] text-ink-muted ${blocked ? 'opacity-50' : ''}`}>
            {description}
          </div>
        </div>
      </div>

      {blocked ? (
        <>
          <p className="rounded-md bg-surface-sunk px-4 py-3 text-ink">
            You’re using advanced features on {used} of {codesWord(allowance)}.{' '}
            <Link href="/pricing#plans" className="text-evergreen underline">
              Choose a plan
            </Link>{' '}
            to {what}. Your first plan comes with a month free.
          </p>
          {/* Shown faded so it's clear what a plan unlocks; not usable until then. */}
          <div className="pointer-events-none flex flex-col gap-4 opacity-50" inert>
            {children}
          </div>
        </>
      ) : (
        children
      )}
    </section>
  )
}
