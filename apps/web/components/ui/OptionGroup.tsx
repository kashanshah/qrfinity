'use client'

import { useId, type ReactNode } from 'react'

/** A radio group drawn as tiles: used for content types, patterns and frames. */
export function OptionGroup<T extends string>({
  label,
  value,
  options,
  onChange,
  columns = 'grid-cols-4',
  hideLabel = false,
}: {
  label: string
  value: T
  options: ReadonlyArray<{ value: T; label: string; icon?: ReactNode }>
  onChange: (value: T) => void
  columns?: string
  hideLabel?: boolean
}) {
  const name = useId()
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className={hideLabel ? 'sr-only' : 'label mb-1.5 text-ink'}>{label}</legend>
      <div className={`grid gap-2 ${columns}`}>
        {options.map((o) => {
          const checked = o.value === value
          return (
            <label
              key={o.value}
              className={`label relative flex min-h-11 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border-[1.5px] px-2 py-2 text-center has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus ${
                checked
                  ? 'border-evergreen bg-mint text-ink'
                  : 'border-control-border bg-surface text-ink hover:bg-surface-sunk'
              }`}
            >
              <input
                type="radio"
                name={name}
                value={o.value}
                checked={checked}
                onChange={() => onChange(o.value)}
                className="sr-only"
              />
              {o.icon}
              <span>{o.label}</span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
