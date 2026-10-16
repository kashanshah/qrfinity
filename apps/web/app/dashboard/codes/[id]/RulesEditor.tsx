'use client'

import {
  MAX_RULES,
  RULE_DEVICES,
  describeCondition,
  type RedirectRule,
  type RuleCondition,
  type RuleDevice,
} from '@qrfinity/core'
import { ArrowDown, ArrowUp, Plus, Split, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useId, useState, useSyncExternalStore, useTransition } from 'react'
import { setRulesAction } from '@/app/dashboard/actions'
import { Button } from '@/components/ui/Button'
import { Checkbox, SelectField, TextField } from '@/components/ui/Field'

type Kind = RuleCondition['type']

/** A rule being edited. Countries are typed as text and parsed on save. */
type Draft = {
  key: number
  name: string
  dest: string
  kind: Kind
  devices: RuleDevice[]
  countries: string
  timezone: string
  days: number[]
  from: string
  to: string
  start: string
  end: string
}

const KINDS: { value: Kind; label: string }[] = [
  { value: 'device', label: 'Phone type' },
  { value: 'country', label: 'Country' },
  { value: 'schedule', label: 'Days and times' },
  { value: 'dates', label: 'Dates' },
]

const DEVICE_LABEL: Record<RuleDevice, { label: string; hint?: string }> = {
  ios: { label: 'iPhone and iPad' },
  android: { label: 'Android' },
  other: { label: 'Everything else', hint: 'Computers, and iPads set to ask for desktop sites' },
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

let nextKey = 1
const browserZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

function blank(kind: Kind = 'device', patch: Partial<Draft> = {}): Draft {
  return {
    key: nextKey++,
    name: '',
    dest: '',
    kind,
    devices: [],
    countries: '',
    timezone: browserZone(),
    days: [1, 2, 3, 4, 5],
    from: '09:00',
    to: '17:00',
    start: '',
    end: '',
    ...patch,
  }
}

function fromRule(r: RedirectRule): Draft {
  const d = blank(r.when.type, { name: r.name, dest: r.dest })
  const w = r.when
  if (w.type === 'device') d.devices = w.devices
  if (w.type === 'country') d.countries = w.countries.join(', ')
  if (w.type === 'schedule')
    Object.assign(d, { timezone: w.timezone, days: w.days, from: w.from, to: w.to })
  if (w.type === 'dates') Object.assign(d, { timezone: w.timezone, start: w.start, end: w.end })
  return d
}

const parseCountries = (text: string) => [
  ...new Set(
    text
      .toUpperCase()
      .split(/[\s,;]+/)
      .filter(Boolean),
  ),
]

function toRule(d: Draft): { name: string; dest: string; when: RuleCondition } {
  const when: RuleCondition =
    d.kind === 'device'
      ? { type: 'device', devices: d.devices }
      : d.kind === 'country'
        ? { type: 'country', countries: parseCountries(d.countries) }
        : d.kind === 'schedule'
          ? { type: 'schedule', timezone: d.timezone, days: d.days, from: d.from, to: d.to }
          : { type: 'dates', timezone: d.timezone, start: d.start, end: d.end }
  return { name: d.name.trim(), dest: d.dest.trim(), when }
}

/** True after hydration: lists that differ between server and browser render only then. */
const useHydrated = () =>
  useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )

function countryNames(codes: string[]): string {
  try {
    const names = new Intl.DisplayNames(['en'], { type: 'region' })
    return codes.map((c) => (/^[A-Z]{2}$/.test(c) ? (names.of(c) ?? c) : `${c}?`)).join(', ')
  } catch {
    return codes.join(', ')
  }
}

function TimeZoneField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const hydrated = useHydrated()
  const zones: string[] = (() => {
    if (!hydrated) return [value]
    try {
      const all = (Intl as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.(
        'timeZone',
      )
      return all?.includes(value) ? all : [value, ...(all ?? [])]
    } catch {
      return [value]
    }
  })()
  return (
    <SelectField
      label="Time zone"
      value={value}
      options={zones.map((z) => ({ value: z, label: z.replace(/_/g, ' ') }))}
      onChange={onChange}
    />
  )
}

function RuleCard({
  draft,
  index,
  count,
  onChange,
  onMove,
  onRemove,
  disabled,
}: {
  draft: Draft
  index: number
  count: number
  onChange: (patch: Partial<Draft>) => void
  onMove: (by: -1 | 1) => void
  onRemove: () => void
  disabled: boolean
}) {
  const id = useId()
  const countries = parseCountries(draft.countries)
  return (
    <li className="flex flex-col gap-4 rounded-lg border border-hairline bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="label text-ink">Rule {index + 1}</h3>
        <div className="flex gap-1">
          <IconButton label="Move up" disabled={disabled || index === 0} onClick={() => onMove(-1)}>
            <ArrowUp aria-hidden="true" size={18} strokeWidth={1.75} />
          </IconButton>
          <IconButton
            label="Move down"
            disabled={disabled || index === count - 1}
            onClick={() => onMove(1)}
          >
            <ArrowDown aria-hidden="true" size={18} strokeWidth={1.75} />
          </IconButton>
          <IconButton label={`Remove rule ${index + 1}`} disabled={disabled} onClick={onRemove}>
            <Trash2 aria-hidden="true" size={18} strokeWidth={1.75} />
          </IconButton>
        </div>
      </div>

      <SelectField
        label="When"
        value={draft.kind}
        options={KINDS}
        onChange={(kind) => onChange({ kind })}
        disabled={disabled}
      />

      {draft.kind === 'device' ? (
        <fieldset className="flex flex-col gap-3" disabled={disabled}>
          <legend className="sr-only">Phone types</legend>
          {RULE_DEVICES.map((d) => (
            <Checkbox
              key={d}
              label={DEVICE_LABEL[d].label}
              hint={DEVICE_LABEL[d].hint}
              checked={draft.devices.includes(d)}
              onChange={(on) =>
                onChange({
                  devices: on ? [...draft.devices, d] : draft.devices.filter((x) => x !== d),
                })
              }
            />
          ))}
        </fieldset>
      ) : null}

      {draft.kind === 'country' ? (
        <TextField
          label="Country codes"
          placeholder="CA, US"
          value={draft.countries}
          onChange={(e) => onChange({ countries: e.target.value })}
          disabled={disabled}
          hint={
            countries.length
              ? countryNames(countries)
              : 'Two-letter codes separated by commas, like CA for Canada or GB for the United Kingdom.'
          }
        />
      ) : null}

      {draft.kind === 'schedule' ? (
        <>
          <div role="group" aria-labelledby={`${id}-days`} className="flex flex-col gap-1.5">
            <span id={`${id}-days`} className="label text-ink">
              Days
            </span>
            <div className="flex flex-wrap gap-1">
              {DAYS.map((label, day) => {
                const on = draft.days.includes(day)
                return (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={on}
                    disabled={disabled}
                    onClick={() =>
                      onChange({
                        days: on ? draft.days.filter((x) => x !== day) : [...draft.days, day],
                      })
                    }
                    className={`label min-h-11 min-w-12 rounded-md border-[1.5px] px-2 ${on ? 'border-evergreen bg-mint font-bold text-ink' : 'border-control-border text-ink-muted hover:bg-surface-sunk'}`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="From"
              type="time"
              value={draft.from}
              onChange={(e) => onChange({ from: e.target.value })}
              disabled={disabled}
            />
            <TextField
              label="Until"
              type="time"
              value={draft.to}
              onChange={(e) => onChange({ to: e.target.value })}
              disabled={disabled}
              hint={draft.to < draft.from ? 'Runs past midnight into the next day.' : undefined}
            />
          </div>
          <TimeZoneField value={draft.timezone} onChange={(timezone) => onChange({ timezone })} />
        </>
      ) : null}

      {draft.kind === 'dates' ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="From"
              type="date"
              value={draft.start}
              onChange={(e) => onChange({ start: e.target.value })}
              disabled={disabled}
            />
            <TextField
              label="Until (included)"
              type="date"
              value={draft.end}
              onChange={(e) => onChange({ end: e.target.value })}
              disabled={disabled}
            />
          </div>
          <TimeZoneField value={draft.timezone} onChange={(timezone) => onChange({ timezone })} />
        </>
      ) : null}

      <TextField
        label="Send people to"
        type="url"
        inputMode="url"
        placeholder="https://apps.apple.com/app/…"
        value={draft.dest}
        onChange={(e) => onChange({ dest: e.target.value })}
        disabled={disabled}
      />
      <TextField
        label="Name (optional)"
        placeholder="Shown in your scan analytics"
        maxLength={60}
        value={draft.name}
        onChange={(e) => onChange({ name: e.target.value })}
        disabled={disabled}
      />
    </li>
  )
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="flex size-11 items-center justify-center rounded-md text-ink-muted hover:bg-surface-sunk hover:text-ink disabled:opacity-40"
    >
      {children}
    </button>
  )
}

export function RulesEditor({
  id,
  rules,
  paused,
  canAdd,
  used,
  allowance,
  disabled,
}: {
  id: string
  rules: RedirectRule[]
  /** Beyond the plan's allowance: rules are kept but don't apply. */
  paused: boolean
  /** False when this code has no advanced features and the allowance is used up. */
  canAdd: boolean
  used: number
  allowance: number
  disabled: boolean
}) {
  const router = useRouter()
  const [drafts, setDrafts] = useState<Draft[]>(() => rules.map(fromRule))
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, start] = useTransition()
  const locked = disabled || pending
  const dirty =
    JSON.stringify(drafts.map(toRule)) !==
    JSON.stringify(rules.map((r) => ({ name: r.name, dest: r.dest, when: r.when })))

  const update = (key: number, patch: Partial<Draft>) => {
    setSaved(false)
    setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...patch } : d)))
  }
  const move = (i: number, by: -1 | 1) => {
    setSaved(false)
    setDrafts((ds) => {
      const next = [...ds]
      const [d] = next.splice(i, 1)
      next.splice(i + by, 0, d!)
      return next
    })
  }
  const save = () =>
    start(async () => {
      setError(null)
      const r = await setRulesAction(id, drafts.map(toRule))
      if (!r.ok) setError(r.error)
      else {
        setDrafts(r.data.map(fromRule))
        setSaved(true)
        router.refresh()
      }
    })

  const blocked = !canAdd && rules.length === 0

  return (
    <section
      aria-labelledby="rules"
      className="flex flex-col gap-4 rounded-lg border border-hairline bg-surface p-4 md:p-6"
    >
      <div className="flex items-start gap-3">
        <Split
          aria-hidden="true"
          size={20}
          strokeWidth={1.75}
          className="mt-1 shrink-0 text-evergreen"
        />
        <div>
          <h2 id="rules" className="subheading text-ink">
            Redirect rules{' '}
            <span className="label ml-1 rounded-pill border border-hairline px-2 py-0.5 align-middle font-normal text-ink-muted">
              Advanced feature
            </span>
          </h2>
          <p className="mt-1 max-w-[65ch] text-ink-muted">
            Send people somewhere else depending on their phone, country or the time. Rules are
            checked in order and the first that matches wins; everyone else goes to the main
            destination.
          </p>
        </div>
      </div>

      {paused ? (
        <p role="status" className="rounded-md border-[1.5px] border-scan-fail px-4 py-3 text-ink">
          These rules are paused because your plan covers fewer codes with advanced features. Every
          scan goes to the main destination for now; your short link keeps working.{' '}
          <Link href="/pricing#plans" className="text-evergreen underline">
            Choose a plan
          </Link>{' '}
          to turn them back on, or remove them.
        </p>
      ) : null}

      {blocked ? (
        <p className="rounded-md bg-surface-sunk px-4 py-3 text-ink">
          You’re using advanced features on {used} of {allowance}{' '}
          {allowance === 1 ? 'code' : 'codes'}.{' '}
          <Link href="/pricing#plans" className="text-evergreen underline">
            Choose a plan
          </Link>{' '}
          to add redirect rules to this code too. Your first plan comes with a month free.
        </p>
      ) : (
        <>
          {drafts.length ? (
            <ol className="flex flex-col gap-3">
              {drafts.map((d, i) => (
                <RuleCard
                  key={d.key}
                  draft={d}
                  index={i}
                  count={drafts.length}
                  onChange={(p) => update(d.key, p)}
                  onMove={(by) => move(i, by)}
                  onRemove={() => {
                    setSaved(false)
                    setDrafts((ds) => ds.filter((x) => x.key !== d.key))
                  }}
                  disabled={locked}
                />
              ))}
            </ol>
          ) : (
            <div className="flex flex-col gap-2 rounded-md bg-surface-sunk px-4 py-3">
              <p className="text-ink">No rules yet: every scan goes to the main destination.</p>
              <p className="body-small text-ink-muted">
                A common one: send iPhones to the App Store and Android phones to Google Play.
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            {drafts.length === 0 ? (
              <Button
                disabled={locked || paused}
                onClick={() =>
                  setDrafts([
                    blank('device', { devices: ['ios'], name: 'App Store' }),
                    blank('device', { devices: ['android'], name: 'Google Play' }),
                  ])
                }
              >
                Add App Store and Google Play rules
              </Button>
            ) : null}
            <Button
              icon={<Plus aria-hidden="true" size={18} strokeWidth={1.75} />}
              disabled={locked || paused || drafts.length >= MAX_RULES}
              onClick={() => setDrafts((ds) => [...ds, blank()])}
            >
              Add a rule
            </Button>
            {dirty || drafts.length ? (
              <Button variant="primary" disabled={locked || !dirty} onClick={save}>
                {pending ? 'Saving…' : drafts.length ? 'Save rules' : 'Remove all rules'}
              </Button>
            ) : null}
          </div>
          {drafts.length >= MAX_RULES ? (
            <p className="body-small text-ink-muted">A code can have up to {MAX_RULES} rules.</p>
          ) : null}
        </>
      )}

      {error ? (
        <p role="alert" className="text-ink">
          <span
            aria-hidden="true"
            className="mr-2 inline-block size-2 rounded-full bg-scan-fail align-middle"
          />
          {error}
        </p>
      ) : saved && !dirty ? (
        <p role="status" className="body-small text-ink-muted">
          Saved. Scans follow the new rules within a minute.
        </p>
      ) : null}

      {rules.length && !paused ? (
        <p className="body-small text-ink-muted">
          In effect: {rules.map((r) => r.name || describeCondition(r.when)).join(' → ')} → main
          destination.
        </p>
      ) : null}
    </section>
  )
}
