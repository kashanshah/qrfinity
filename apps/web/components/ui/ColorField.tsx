'use client'

import { isHexColor, normalizeHex } from '@qrfinity/core'
import { useId, useState } from 'react'

/** Colour picker plus a hex text box, kept in sync. */
export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (hex: string) => void
}) {
  const id = useId()
  // What the person is typing; null shows the current value.
  const [draft, setDraft] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="label text-ink">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label}: picker`}
          value={normalizeHex(value)}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-12 shrink-0 cursor-pointer rounded-sm border-[1.5px] border-control-border bg-surface p-1"
        />
        <input
          id={id}
          value={draft ?? value}
          spellCheck={false}
          maxLength={7}
          onChange={(e) => {
            setDraft(e.target.value)
            if (isHexColor(e.target.value)) onChange(normalizeHex(e.target.value))
          }}
          onBlur={() => setDraft(null)}
          className="mono w-full min-w-0 rounded-md border-[1.5px] border-control-border bg-surface px-3 py-2.5 text-ink uppercase"
        />
      </div>
    </div>
  )
}
