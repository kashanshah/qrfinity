'use client'

import { useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'

const control =
  'w-full rounded-md border-[1.5px] border-control-border bg-surface px-3 py-2.5 text-ink placeholder:text-ink-muted/70 aria-[invalid=true]:border-scan-fail'

function FieldShell({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string
  label: string
  hint?: ReactNode
  error?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="label text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-msg`} className="body-small text-ink">
          <span
            aria-hidden="true"
            className="mr-1 inline-block size-2 rounded-full bg-scan-fail align-middle"
          />
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-msg`} className="body-small text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

type Common = { label: string; hint?: ReactNode; error?: string }

export function TextField({
  label,
  hint,
  error,
  ...props
}: Common & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId()
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${id}-msg` : undefined}
        className={control}
        {...props}
      />
    </FieldShell>
  )
}

export function TextArea({
  label,
  hint,
  error,
  ...props
}: Common & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId()
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <textarea
        id={id}
        rows={4}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${id}-msg` : undefined}
        className={`${control} resize-y`}
        {...props}
      />
    </FieldShell>
  )
}

export function SelectField<T extends string>({
  label,
  hint,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string
  hint?: ReactNode
  value: T
  options: ReadonlyArray<{ value: T; label: string }>
  onChange: (value: T) => void
  disabled?: boolean
}) {
  const id = useId()
  return (
    <FieldShell id={id} label={label} hint={hint}>
      <select
        id={id}
        value={value}
        disabled={disabled}
        aria-describedby={hint ? `${id}-msg` : undefined}
        onChange={(e) => onChange(e.target.value as T)}
        className={`${control} disabled:opacity-50`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  )
}

export function Checkbox({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  hint?: ReactNode
}) {
  const id = useId()
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-describedby={hint ? `${id}-msg` : undefined}
        className="mt-0.5 size-5 shrink-0 rounded-sm accent-evergreen"
      />
      <div>
        <label htmlFor={id} className="label text-ink">
          {label}
        </label>
        {hint ? (
          <p id={`${id}-msg`} className="body-small text-ink-muted">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  )
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  format: (value: number) => string
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="label text-ink">
          {label}
        </label>
        <output htmlFor={id} className="mono text-ink-muted">
          {format(value)}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-11 w-full accent-evergreen"
      />
    </div>
  )
}
