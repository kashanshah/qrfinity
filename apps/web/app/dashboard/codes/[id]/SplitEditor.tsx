'use client'

import { MAX_VARIANTS, type Split } from '@qrfinity/core'
import { Plus, Shuffle, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { setSplitAction } from '@/app/dashboard/actions'
import { track } from '@/lib/analytics'
import { AdvancedSection, type AdvancedAccess } from '@/components/dashboard/Advanced'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'

type Draft = { key: number; name: string; dest: string; percent: string }

const LETTERS = 'BCDE'
let nextKey = 1
const toDrafts = (split: Split | null): Draft[] =>
  (split?.variants ?? []).map((v) => ({
    key: nextKey++,
    name: v.name,
    dest: v.dest,
    percent: String(v.percent),
  }))
const toInput = (drafts: Draft[]) =>
  drafts.map((d) => ({ name: d.name.trim(), dest: d.dest.trim(), percent: Number(d.percent) }))

/** Shares scans between the main destination and other versions, to compare them. */
export function SplitEditor({
  id,
  destination,
  split,
  paused,
  canAdd,
  used,
  allowance,
  access,
  disabled,
}: {
  id: string
  destination: string
  split: Split | null
  /** Beyond the plan's allowance: the split is kept but every scan goes to the main destination. */
  paused: boolean
  canAdd: boolean
  used: number
  allowance: number
  access: AdvancedAccess
  disabled: boolean
}) {
  const router = useRouter()
  const [drafts, setDrafts] = useState<Draft[]>(() => toDrafts(split))
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, start] = useTransition()
  const locked = disabled || pending || paused
  // Compared field by field: stored JSON can come back with its keys in another order.
  const dirty = JSON.stringify(toInput(drafts)) !== JSON.stringify(toInput(toDrafts(split)))
  const others = drafts.reduce((sum, d) => sum + (Number(d.percent) || 0), 0)
  const main = 100 - others

  const update = (key: number, patch: Partial<Draft>) => {
    setSaved(false)
    setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...patch } : d)))
  }
  const save = () =>
    start(async () => {
      setError(null)
      const r = await setSplitAction(id, toInput(drafts))
      if (!r.ok) {
        setError(r.error)
        track('code_feature_failed', { feature: 'split', code: r.code })
      } else {
        const versions = toDrafts(r.data).length
        track('code_feature_saved', { feature: 'split', on: versions > 0, count: versions })
        setDrafts(toDrafts(r.data))
        setSaved(true)
        router.refresh()
      }
    })

  return (
    <AdvancedSection
      id="split"
      icon={Shuffle}
      title="Split traffic"
      description="Share scans between the main destination and up to four other versions, to see which works better. Each scan picks a version at random by its share; redirect rules still come first. Compare the versions under Scans."
      access={access}
      used={used}
      allowance={allowance}
      blocked={!canAdd && !split}
      what="split traffic on this code too"
    >
      {paused ? (
        <p role="status" className="rounded-md border-[1.5px] border-scan-fail px-4 py-3 text-ink">
          This split is paused because your plan covers fewer codes with advanced features. Every
          scan goes to the main destination for now.{' '}
          <Link href="/pricing#plans" className="text-evergreen underline">
            Choose a plan
          </Link>{' '}
          to turn it back on, or remove it.
        </p>
      ) : null}

      {drafts.length ? (
        <ol className="flex flex-col gap-3">
          <li className="flex flex-col gap-1 rounded-md bg-surface-sunk px-4 py-3">
            <span className="label text-ink">Version A: main destination</span>
            <span className="body-small break-all text-ink-muted">{destination}</span>
            <span className="body-small text-ink">
              {main >= 1 ? `${main}% of scans` : 'Leave at least 1% for the main destination'}
            </span>
          </li>
          {drafts.map((d, i) => (
            <li
              key={d.key}
              className="flex flex-col gap-3 rounded-md border border-hairline p-4 sm:flex-row sm:items-start"
            >
              <div className="grid flex-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_112px]">
                <TextField
                  label={`Version ${LETTERS[i]} name (optional)`}
                  value={d.name}
                  maxLength={60}
                  placeholder={`Version ${LETTERS[i]}`}
                  disabled={locked}
                  onChange={(e) => update(d.key, { name: e.target.value })}
                />
                <TextField
                  label="Send people to"
                  type="url"
                  inputMode="url"
                  value={d.dest}
                  placeholder="example.com/new-menu"
                  disabled={locked}
                  onChange={(e) => update(d.key, { dest: e.target.value })}
                />
                <TextField
                  label="Share (%)"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={99}
                  value={d.percent}
                  disabled={locked}
                  onChange={(e) => update(d.key, { percent: e.target.value })}
                />
              </div>
              <Button
                aria-label={`Remove version ${LETTERS[i]}`}
                icon={<Trash2 aria-hidden="true" size={18} strokeWidth={1.75} />}
                disabled={locked}
                className="sm:mt-7"
                onClick={() => {
                  setSaved(false)
                  setDrafts((ds) => ds.filter((x) => x.key !== d.key))
                }}
              />
            </li>
          ))}
        </ol>
      ) : (
        <div className="flex flex-col gap-2 rounded-md bg-surface-sunk px-4 py-3">
          <p className="text-ink">No split: every scan goes to the main destination.</p>
          <p className="body-small text-ink-muted">
            For example, send half your scans to a new menu page and compare how many people order.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          icon={<Plus aria-hidden="true" size={18} strokeWidth={1.75} />}
          disabled={locked || drafts.length >= MAX_VARIANTS}
          onClick={() => {
            setSaved(false)
            setDrafts((ds) => [
              ...ds,
              {
                key: nextKey++,
                name: '',
                dest: '',
                percent: String(ds.length ? 10 : 50),
              },
            ])
          }}
        >
          {drafts.length ? 'Add a version' : 'Split traffic 50/50'}
        </Button>
        {dirty ? (
          <Button variant="primary" disabled={locked} onClick={save}>
            {pending ? 'Saving…' : drafts.length ? 'Save split' : 'Remove split'}
          </Button>
        ) : null}
      </div>

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
          Saved. Scans follow the new split within a minute.
        </p>
      ) : null}
    </AdvancedSection>
  )
}
