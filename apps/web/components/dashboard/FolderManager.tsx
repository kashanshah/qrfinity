'use client'

import { Pencil, Plus, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { createFolderAction, deleteFolderAction, renameFolderAction } from '@/app/dashboard/actions'
import { track } from '@/lib/analytics'

type Folder = { id: string; name: string }

export function FolderManager({ folders, active }: { folders: Folder[]; active: string | null }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const act = (
    action: 'create' | 'rename' | 'delete',
    fn: () => Promise<{ ok: boolean; error?: string }>,
    after?: () => void,
  ) =>
    start(async () => {
      setError(null)
      const r = await fn()
      if (!r.ok) setError(r.error ?? 'Something went wrong.')
      else {
        track('folder_managed', { action })
        after?.()
        router.refresh()
      }
    })

  const item = (href: string, label: string, on: boolean) => (
    <Link
      href={href}
      aria-current={on ? 'page' : undefined}
      className={`label block flex-1 truncate rounded-md px-3 py-2 ${on ? 'bg-mint font-bold text-ink' : 'text-ink hover:bg-surface-sunk'}`}
    >
      {label}
    </Link>
  )

  return (
    <nav aria-label="Folders" className="flex flex-col gap-1">
      <h2 className="label mb-1 px-3 text-ink-muted">Folders</h2>
      {item('/dashboard', 'All codes', !active)}
      {folders.map((f) =>
        editing === f.id ? (
          <form
            key={f.id}
            className="flex gap-1"
            onSubmit={(e) => {
              e.preventDefault()
              act(
                'rename',
                () => renameFolderAction(f.id, editName),
                () => setEditing(null),
              )
            }}
          >
            <input
              aria-label="Folder name"
              value={editName}
              autoFocus
              maxLength={60}
              onChange={(e) => setEditName(e.target.value)}
              className="min-w-0 flex-1 rounded-md border-[1.5px] border-control-border bg-surface px-2 py-1.5 text-ink"
            />
            <button
              type="submit"
              className="label rounded-md px-2 text-evergreen"
              disabled={pending}
            >
              Save
            </button>
          </form>
        ) : (
          <div key={f.id} className="group flex items-center gap-1">
            {item(`/dashboard?folder=${f.id}`, f.name, active === f.id)}
            <button
              type="button"
              aria-label={`Rename ${f.name}`}
              onClick={() => {
                setEditing(f.id)
                setEditName(f.name)
              }}
              className="rounded-md p-2 text-ink-muted hover:bg-surface-sunk hover:text-ink"
            >
              <Pencil aria-hidden="true" size={14} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              aria-label={`Delete ${f.name}`}
              onClick={() => {
                if (
                  confirm(
                    `Delete the folder “${f.name}”? Its codes stay; they just leave the folder.`,
                  )
                ) {
                  act(
                    'delete',
                    () => deleteFolderAction(f.id),
                    () => active === f.id && router.push('/dashboard'),
                  )
                }
              }}
              className="rounded-md p-2 text-ink-muted hover:bg-surface-sunk hover:text-ink"
            >
              <Trash2 aria-hidden="true" size={14} strokeWidth={1.75} />
            </button>
          </div>
        ),
      )}
      <form
        className="mt-2 flex gap-1"
        onSubmit={(e) => {
          e.preventDefault()
          if (newName.trim())
            act(
              'create',
              () => createFolderAction(newName),
              () => setNewName(''),
            )
        }}
      >
        <input
          aria-label="New folder name"
          placeholder="New folder"
          value={newName}
          maxLength={60}
          onChange={(e) => setNewName(e.target.value)}
          className="body-small min-w-0 flex-1 rounded-md border-[1.5px] border-control-border bg-surface px-2 py-1.5 text-ink"
        />
        <button
          type="submit"
          aria-label="Add folder"
          disabled={pending}
          className="rounded-md p-2 text-evergreen hover:bg-surface-sunk"
        >
          <Plus aria-hidden="true" size={18} strokeWidth={1.75} />
        </button>
      </form>
      {error ? (
        <p role="alert" className="body-small px-3 text-ink">
          {error}
        </p>
      ) : null}
    </nav>
  )
}
