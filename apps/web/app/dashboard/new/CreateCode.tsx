'use client'

import type { CodeContent } from '@qrfinity/db'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { track } from '@/lib/analytics'
import { createCodeAction } from '@/app/dashboard/actions'
import { Generator, type FinalStepProps } from '@/components/generator/Generator'
import { Button } from '@/components/ui/Button'
import { SelectField, TextField } from '@/components/ui/Field'
import { clearDraft, readDraft } from '@/lib/draft'

export type Folder = { id: string; name: string }
export type SlugUsage = { used: number; allowance: number }

function suggestName(destination: string) {
  try {
    const u = new URL(destination)
    return (u.hostname.replace(/^www\./, '') + (u.pathname !== '/' ? u.pathname : '')).slice(0, 60)
  } catch {
    return ''
  }
}

function CreateStep({
  props,
  folders,
  slugs,
  shortLinkBase,
}: {
  props: FinalStepProps
  folders: Folder[]
  slugs: SlugUsage
  shortLinkBase: string
}) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [folderId, setFolderId] = useState('')
  const [slug, setSlug] = useState('')
  const slugsLeft = Math.max(0, slugs.allowance - slugs.used)
  const linkHost = shortLinkBase.replace(/^https?:\/\//, '')
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
              slug: slug.trim() || null,
            })
            if (r.ok) {
              track('dynamic_code_created', {
                content_type: props.type,
                custom_slug: Boolean(slug.trim()),
              })
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
        {slugs.allowance > 0 ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="custom-slug" className="label text-ink">
              Custom short link (optional)
            </label>
            <div className="flex min-h-11 items-stretch overflow-hidden rounded-md border-[1.5px] border-control-border bg-surface focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus">
              <span className="mono flex items-center border-r border-hairline bg-surface-sunk px-3 text-ink-muted">
                {linkHost}/
              </span>
              <input
                id="custom-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                disabled={slugsLeft === 0}
                maxLength={40}
                placeholder={slugsLeft === 0 ? 'random' : 'joes-menu'}
                autoComplete="off"
                spellCheck={false}
                aria-describedby="custom-slug-hint"
                className="mono min-w-0 flex-1 bg-transparent px-3 text-ink outline-none disabled:opacity-60"
              />
            </div>
            <p id="custom-slug-hint" className="body-small text-ink-muted">
              {slugsLeft === 0
                ? `You’ve used your ${slugs.allowance} custom short ${slugs.allowance === 1 ? 'link' : 'links'}. This code gets a random one. More are coming with Pro.`
                : `${slugsLeft} of ${slugs.allowance} free custom ${slugs.allowance === 1 ? 'link' : 'links'} left. Leave empty for a random one. It can’t be changed after you create the code.`}
            </p>
          </div>
        ) : null}
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
  slugs,
}: {
  shortLinkBase: string
  folders: Folder[]
  slugs: SlugUsage
}) {
  // Read once on mount: a draft carried over from the homepage, if any.
  const [draft] = useState(() => readDraft())
  return (
    <Generator
      init={{ ...draft, kind: 'dynamic' }}
      shortLinkBase={shortLinkBase}
      contentTitle="1. Where should the code send people?"
      finalStep={(p) => (
        <CreateStep props={p} folders={folders} slugs={slugs} shortLinkBase={shortLinkBase} />
      )}
    />
  )
}
