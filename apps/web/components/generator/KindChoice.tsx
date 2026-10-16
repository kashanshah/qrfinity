'use client'

import { Check, Link2, Minus, QrCode } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import type { CodeKind } from '@/lib/store'

const KINDS: {
  value: CodeKind
  title: string
  tag: string
  icon: ReactNode
  summary: string
  points: { ok: boolean; text: string }[]
}[] = [
  {
    value: 'static',
    title: 'Static',
    tag: 'No sign-up',
    icon: <QrCode aria-hidden="true" size={20} strokeWidth={1.75} />,
    summary: 'The content is stored in the code itself.',
    points: [
      { ok: true, text: 'Works forever, even without us' },
      { ok: true, text: 'Download right away' },
      { ok: false, text: 'Can’t be changed after printing' },
      { ok: false, text: 'No scan stats' },
    ],
  },
  {
    value: 'dynamic',
    title: 'Dynamic',
    tag: 'Free account',
    icon: <Link2 aria-hidden="true" size={20} strokeWidth={1.75} />,
    summary: 'The code holds a short link you control.',
    points: [
      { ok: true, text: 'Change where it goes any time' },
      { ok: true, text: 'See how many people scan' },
      { ok: true, text: 'Never deactivated' },
      { ok: false, text: 'Needs a free account to save' },
    ],
  },
]

/** Static or dynamic, as two described cards (a radio group). */
export function KindChoice({
  value,
  onChange,
}: {
  value: CodeKind
  onChange: (kind: CodeKind) => void
}) {
  const name = useId()
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="label mb-1.5 text-ink">Type of code</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {KINDS.map((k) => {
          const checked = k.value === value
          return (
            <label
              key={k.value}
              className={`relative flex cursor-pointer flex-col gap-3 rounded-lg border-2 p-4 text-left has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus ${
                checked
                  ? 'border-evergreen bg-mint'
                  : 'border-control-border bg-surface hover:bg-surface-sunk'
              }`}
            >
              <input
                type="radio"
                name={name}
                value={k.value}
                checked={checked}
                onChange={() => onChange(k.value)}
                className="sr-only"
                aria-label={`${k.title}, ${k.tag}`}
                aria-describedby={`${name}-${k.value}`}
              />
              <span className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${
                    checked ? 'border-evergreen' : 'border-control-border'
                  }`}
                >
                  {checked ? <span className="size-2.5 rounded-full bg-evergreen" /> : null}
                </span>
                <span className="text-ink">{k.icon}</span>
                <span className="subheading text-ink">{k.title}</span>
                <span className="label ml-auto rounded-pill border-[1.5px] border-control-border bg-surface px-2.5 py-0.5 text-ink">
                  {k.tag}
                </span>
              </span>
              <span id={`${name}-${k.value}`} className="flex flex-col gap-2">
                <span className="body-small text-ink">{k.summary}</span>
                <ul className="flex flex-col gap-1">
                  {k.points.map((p) => (
                    <li key={p.text} className="body-small flex items-start gap-2 text-ink">
                      {p.ok ? (
                        <Check
                          aria-hidden="true"
                          size={16}
                          strokeWidth={2}
                          className="mt-0.5 shrink-0 text-evergreen"
                        />
                      ) : (
                        <Minus
                          aria-hidden="true"
                          size={16}
                          strokeWidth={2}
                          className="mt-0.5 shrink-0 text-ink-muted"
                        />
                      )}
                      <span className={p.ok ? undefined : 'text-ink-muted'}>{p.text}</span>
                    </li>
                  ))}
                </ul>
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
