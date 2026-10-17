'use client'

import { Pencil } from 'lucide-react'
import { useState, useTransition } from 'react'
import { renameCodeAction } from '@/app/dashboard/actions'
import { track } from '@/lib/analytics'

export function RenameCode({ id, name }: { id: string; name: string }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(name)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <h1 className="heading break-words text-ink">{name}</h1>
        <button
          type="button"
          aria-label="Rename"
          onClick={() => setEditing(true)}
          className="rounded-md p-2 text-ink-muted hover:bg-surface-sunk hover:text-ink"
        >
          <Pencil aria-hidden="true" size={18} strokeWidth={1.75} />
        </button>
      </div>
    )
  }
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        start(async () => {
          const r = await renameCodeAction(id, value)
          if (r.ok) {
            setEditing(false)
            track('code_managed', { action: 'rename' })
          } else setError(r.error)
        })
      }}
    >
      <label htmlFor="code-name" className="sr-only">
        Name
      </label>
      <input
        id="code-name"
        value={value}
        maxLength={80}
        autoFocus
        onChange={(e) => setValue(e.target.value)}
        className="subheading min-w-0 flex-1 rounded-md border-[1.5px] border-control-border bg-surface px-3 py-2 text-ink"
      />
      <button
        type="submit"
        disabled={pending}
        className="button min-h-11 rounded-md bg-evergreen px-5 text-on-evergreen hover:bg-evergreen-deep"
      >
        Save
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="button min-h-11 rounded-md px-4 text-ink hover:bg-surface-sunk"
      >
        Cancel
      </button>
      {error ? (
        <p role="alert" className="body-small w-full text-ink">
          {error}
        </p>
      ) : null}
    </form>
  )
}
