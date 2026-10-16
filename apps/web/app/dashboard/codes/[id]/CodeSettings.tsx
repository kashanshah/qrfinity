'use client'

import type { LinkStatus } from '@qrfinity/core'
import { Copy, Pause, Play, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  deleteCodeAction,
  duplicateCodeAction,
  moveCodeAction,
  setPausedAction,
  setTagsAction,
} from '@/app/dashboard/actions'
import { Button } from '@/components/ui/Button'
import { SelectField, TextField } from '@/components/ui/Field'

type Props = {
  id: string
  status: LinkStatus
  folderId: string | null
  tags: string[]
  folders: { id: string; name: string }[]
}

export function CodeSettings({ id, status, folderId, tags, folders }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [tagText, setTagText] = useState(tags.join(', '))

  const act = (
    fn: () => Promise<{ ok: true; data: unknown } | { ok: false; error: string }>,
    ok?: (data: unknown) => void,
  ) =>
    start(async () => {
      setMessage(null)
      const r = await fn()
      if (!r.ok) setMessage(r.error)
      else {
        ok?.(r.data)
        router.refresh()
      }
    })

  return (
    <section
      aria-labelledby="settings"
      className="flex flex-col gap-6 rounded-lg border border-hairline bg-surface p-4 md:p-6"
    >
      <h2 id="settings" className="subheading text-ink">
        Organise and manage
      </h2>
      <SelectField
        label="Folder"
        value={folderId ?? ''}
        onChange={(v) =>
          act(
            () => moveCodeAction(id, v || null),
            () => setMessage('Moved.'),
          )
        }
        options={[
          { value: '', label: 'No folder' },
          ...folders.map((f) => ({ value: f.id, label: f.name })),
        ]}
        hint={folders.length ? undefined : 'Create folders from the codes list.'}
      />
      <form
        onSubmit={(e) => {
          e.preventDefault()
          act(
            () => setTagsAction(id, tagText.split(',')),
            () => setMessage('Tags saved.'),
          )
        }}
      >
        <TextField
          label="Tags"
          hint="Separate with commas, like: print, lobby"
          value={tagText}
          onChange={(e) => setTagText(e.target.value)}
          action={
            <Button type="submit" disabled={pending}>
              Save tags
            </Button>
          }
        />
      </form>

      <div className="flex flex-wrap gap-2 border-t border-hairline pt-4">
        {status !== 'disabled' ? (
          <Button
            disabled={pending}
            icon={
              status === 'paused' ? (
                <Play aria-hidden="true" size={18} strokeWidth={1.75} />
              ) : (
                <Pause aria-hidden="true" size={18} strokeWidth={1.75} />
              )
            }
            onClick={() =>
              act(
                () => setPausedAction(id, status !== 'paused'),
                () =>
                  setMessage(
                    status === 'paused'
                      ? 'Turned back on.'
                      : 'Paused. Scans now show a “paused by its owner” page.',
                  ),
              )
            }
          >
            {status === 'paused' ? 'Turn back on' : 'Pause'}
          </Button>
        ) : null}
        <Button
          disabled={pending}
          icon={<Copy aria-hidden="true" size={18} strokeWidth={1.75} />}
          onClick={() =>
            act(
              () => duplicateCodeAction(id),
              (newId) => router.push(`/dashboard/codes/${newId as string}`),
            )
          }
        >
          Duplicate
        </Button>
        <Button
          disabled={pending}
          icon={<Trash2 aria-hidden="true" size={18} strokeWidth={1.75} />}
          onClick={() => {
            if (
              confirm(
                'Delete this code? Printed copies will stop opening your link and show “not active” instead. This can’t be undone.',
              )
            ) {
              act(
                () => deleteCodeAction(id),
                () => router.push('/dashboard'),
              )
            }
          }}
        >
          Delete
        </Button>
      </div>
      <p className="body-small text-ink-muted" aria-live="polite">
        {message ?? 'Pausing is the only way a code stops working, and only you can do it.'}
      </p>
    </section>
  )
}
