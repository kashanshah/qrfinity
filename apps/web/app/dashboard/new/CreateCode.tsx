'use client'

import type { CodeContent } from '@qrfinity/db'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { createCodeAction } from '@/app/dashboard/actions'
import { Generator, type FinalStepProps } from '@/components/generator/Generator'
import { Button } from '@/components/ui/Button'
import { SelectField, TextField } from '@/components/ui/Field'
import { clearDraft, readDraft } from '@/lib/draft'

export type Folder = { id: string; name: string }

function suggestName(destination: string) {
  try {
    const u = new URL(destination)
    return (u.hostname.replace(/^www\./, '') + (u.pathname !== '/' ? u.pathname : '')).slice(0, 60)
  } catch {
    return ''
  }
}

function CreateStep({ props, folders }: { props: FinalStepProps; folders: Folder[] }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [folderId, setFolderId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const destination = props.content.ok ? props.content.payload : null

  return (
    <div className="rounded-lg border border-hairline bg-surface p-4 shadow-card md:p-6">
      <h2 className="subheading mb-4 text-ink">3. Create</h2>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!destination) return
          start(async () => {
            setError(null)
            const content = { type: props.type, fields: props.fields[props.type] } as CodeContent
            const r = await createCodeAction({
              name: name.trim() || suggestName(destination) || 'My QR code',
              destination,
              content,
              design: props.design,
              folderId: folderId || null,
            })
            if (r.ok) {
              clearDraft()
              router.push(`/dashboard/codes/${r.data}?created=1`)
            } else setError(r.error)
          })
        }}
      >
        <TextField
          label="Name (only you see it)"
          value={name}
          maxLength={80}
          placeholder={destination ? suggestName(destination) : 'Café menu'}
          onChange={(e) => setName(e.target.value)}
        />
        {folders.length ? (
          <SelectField
            label="Folder"
            value={folderId}
            onChange={setFolderId}
            options={[
              { value: '', label: 'No folder' },
              ...folders.map((f) => ({ value: f.id, label: f.name })),
            ]}
          />
        ) : null}
        <Button type="submit" variant="primary" disabled={!destination || pending}>
          {pending ? 'Creating…' : 'Create dynamic code'}
        </Button>
        <p className="body-small text-ink-muted" role={error ? 'alert' : undefined}>
          {error ??
            (!destination
              ? 'Add the destination first.'
              : props.scanFailed
                ? 'Fix the scan warning before you print. You can change the design after creating the code.'
                : 'You can change the destination and design at any time. The short link stays the same.')}
        </p>
      </form>
    </div>
  )
}

export function CreateCode({
  shortLinkBase,
  folders,
}: {
  shortLinkBase: string
  folders: Folder[]
}) {
  // Read once on mount: a draft carried over from the homepage, if any.
  const [draft] = useState(() => readDraft())
  return (
    <Generator
      init={{ ...draft, kind: 'dynamic' }}
      shortLinkBase={shortLinkBase}
      contentTitle="1. Where should the code send people?"
      finalStep={(p) => <CreateStep props={p} folders={folders} />}
    />
  )
}
