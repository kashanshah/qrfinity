'use client'

import { limitSwitch, type CodeLimits } from '@qrfinity/core'
import { Hourglass } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useSyncExternalStore, useTransition } from 'react'
import { setLimitsAction } from '@/app/dashboard/actions'
import { AdvancedSection, type AdvancedAccess } from '@/components/dashboard/Advanced'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { TimeZoneField, browserZone } from './RulesEditor'

type Draft = { dest: string; date: string; time: string; timezone: string; scans: string }

const toDraft = (l: CodeLimits | null): Draft => ({
  dest: l?.dest ?? '',
  date: l?.date ?? '',
  time: l?.time ?? '',
  // Empty until saved: the browser's zone is shown (it isn't known while rendering on the server).
  timezone: l?.timezone ?? '',
  scans: l?.scans ? String(l.scans) : '',
})

const when = new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium', timeStyle: 'short' })

/** After a date, or once the code has been scanned enough times, scans go to another page. */
export function LimitsEditor({
  id,
  limits,
  paused,
  canAdd,
  used,
  allowance,
  access,
  disabled,
}: {
  id: string
  limits: CodeLimits | null
  paused: boolean
  canAdd: boolean
  used: number
  allowance: number
  access: AdvancedAccess
  disabled: boolean
}) {
  const router = useRouter()
  const zone = useSyncExternalStore(
    () => () => {},
    browserZone,
    () => 'UTC',
  )
  const [draft, setDraft] = useState<Draft>(() => toDraft(limits))
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const locked = disabled || pending || paused
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(limits))
  const switched = limitSwitch(limits)
  // Read once per mount; the page refreshes after every save.
  const [now] = useState(() => Date.now())
  const reached = switched && Date.parse(switched.at) <= now

  const set = (patch: Partial<Draft>) => {
    setMessage(null)
    setError(null)
    setDraft((d) => ({ ...d, ...patch }))
  }
  const save = (next: Draft | null) =>
    start(async () => {
      setError(null)
      const r = await setLimitsAction(id, next)
      if (!r.ok) setError(r.error)
      else {
        setDraft(toDraft(r.data))
        setMessage(
          r.data
            ? 'Saved. Scans follow the new limits within a minute.'
            : 'Limits removed. Scans go to the main destination again.',
        )
        router.refresh()
      }
    })

  return (
    <AdvancedSection
      id="limits"
      icon={Hourglass}
      title="Date and scan limits"
      description="After a date, or once the code has been scanned a set number of times, send people to another page, such as “this offer has ended”. The code itself keeps working. Scan counts are checked every few minutes, so a few extra scans can get through."
      access={access}
      used={used}
      allowance={allowance}
      blocked={!canAdd && !limits}
      what="add limits to this code too"
    >
      {paused ? (
        <p role="status" className="rounded-md border-[1.5px] border-scan-fail px-4 py-3 text-ink">
          These limits are paused because your plan covers fewer codes with advanced features. Every
          scan goes to the main destination for now.{' '}
          <Link href="/pricing#plans" className="text-evergreen underline">
            Choose a plan
          </Link>{' '}
          to turn them back on, or remove them.
        </p>
      ) : reached ? (
        <p role="status" className="rounded-md bg-mint px-4 py-3 text-ink">
          Limit reached {when.format(new Date(switched.at))}: scans now go to {switched.dest}.
        </p>
      ) : null}

      {/* noValidate: addresses without https:// are fine; the server checks and completes them. */}
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          save({ ...draft, timezone: draft.timezone || zone })
        }}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <TextField
            label="After this date"
            type="date"
            value={draft.date}
            disabled={locked}
            onChange={(e) => set({ date: e.target.value })}
          />
          <TextField
            label="At this time"
            type="time"
            value={draft.time}
            disabled={locked || !draft.date}
            hint={draft.date ? undefined : 'Midnight if left empty'}
            onChange={(e) => set({ time: e.target.value })}
          />
          <TimeZoneField
            value={draft.timezone || zone}
            onChange={(timezone) => set({ timezone })}
          />
        </div>
        <div className="max-w-[260px]">
          <TextField
            label="Or after this many scans"
            type="number"
            inputMode="numeric"
            min={1}
            value={draft.scans}
            disabled={locked}
            hint={
              limits?.scans
                ? `Counting since ${when.format(new Date(limits.since))}`
                : 'Counted from when you save'
            }
            onChange={(e) => set({ scans: e.target.value })}
          />
        </div>
        <TextField
          label="Then send people to"
          type="url"
          inputMode="url"
          value={draft.dest}
          placeholder="example.com/offer-ended"
          disabled={locked}
          onChange={(e) => set({ dest: e.target.value })}
        />
        <p className="body-small text-ink-muted">
          Whichever limit comes first switches the code. Set just one if you like.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" disabled={locked || !dirty}>
            {pending ? 'Saving…' : 'Save limits'}
          </Button>
          {limits ? (
            <Button disabled={disabled || pending} onClick={() => save(null)}>
              Remove limits
            </Button>
          ) : null}
        </div>
      </form>

      {error ? (
        <p role="alert" className="text-ink">
          <span
            aria-hidden="true"
            className="mr-2 inline-block size-2 rounded-full bg-scan-fail align-middle"
          />
          {error}
        </p>
      ) : message ? (
        <p role="status" className="body-small text-ink-muted">
          {message}
        </p>
      ) : null}
    </AdvancedSection>
  )
}
