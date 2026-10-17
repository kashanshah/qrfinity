'use client'

import { contactName, isPageType } from '@qrfinity/core'
import type { CodeContent } from '@qrfinity/db'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { contentVariant, designProps, track } from '@/lib/analytics'
import { createCodeAction } from '@/app/dashboard/actions'
import { Generator, type FinalStepProps } from '@/components/generator/Generator'
import { AdvancedMark, advancedAccess } from '@/components/dashboard/Advanced'
import { TrackEvent } from '@/components/TrackEvent'
import { Button } from '@/components/ui/Button'
import { SelectField, TextField } from '@/components/ui/Field'
import { clearDraft, readDraft } from '@/lib/draft'

export type Folder = { id: string; name: string }
export type SlugUsage = { used: number; allowance: number; plan: string }

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
  fromHomepage,
}: {
  props: FinalStepProps
  folders: Folder[]
  slugs: SlugUsage
  shortLinkBase: string
  /** Designed on the homepage and carried through sign-in. */
  fromHomepage: boolean
}) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [folderId, setFolderId] = useState('')
  const [slug, setSlug] = useState('')
  const slugsLeft = Math.max(0, slugs.allowance - slugs.used)
  const linkHost = shortLinkBase.replace(/^https?:\/\//, '')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  // A contact card has no destination: the card itself is saved and shown as a page.
  const isCard = isPageType(props.type)
  const destination = props.content.ok && !isCard ? props.content.payload : null
  const suggested = isCard
    ? contactName(props.fields.vcard)
    : destination
      ? suggestName(destination)
      : ''

  return (
    <div className="rounded-lg border border-hairline bg-surface p-4 shadow-card md:p-6">
      <h2 className="subheading mb-4 text-ink">3. Create</h2>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!props.content.ok) return
          start(async () => {
            setError(null)
            const content = { type: props.type, fields: props.fields[props.type] } as CodeContent
            const r = await createCodeAction({
              name: name.trim() || suggested || 'My QR code',
              destination: destination ?? undefined,
              content,
              design: props.design,
              folderId: folderId || null,
              slug: slug.trim() || null,
            })
            if (r.ok) {
              track('dynamic_code_created', {
                ...designProps(props.design),
                content_type: props.type,
                variant: contentVariant(props.type, props.fields[props.type]),
                custom_slug: Boolean(slug.trim()),
                folder: Boolean(folderId),
                from_homepage: fromHomepage,
                scan: props.scanFailed ? 'fail' : 'pass',
              })
              clearDraft()
              router.push(`/dashboard/codes/${r.data}?created=1`)
            } else {
              setError(r.error)
              track('dynamic_code_create_failed', { content_type: props.type, code: r.code })
            }
          })
        }}
      >
        <TextField
          label="Name (only you see it)"
          value={name}
          maxLength={80}
          placeholder={suggested || 'Café menu'}
          onChange={(e) => setName(e.target.value)}
        />
        {slugs.allowance > 0 ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <label
                htmlFor="custom-slug"
                className={`label text-ink ${slugsLeft === 0 ? 'opacity-50' : ''}`}
              >
                Custom short link (optional)
              </label>
              <AdvancedMark
                access={advancedAccess(slugs)}
                used={slugs.used}
                allowance={slugs.allowance}
                size={16}
              />
            </div>
            <div
              className={`flex min-h-11 items-stretch overflow-hidden rounded-md border-[1.5px] border-control-border bg-surface focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus ${slugsLeft === 0 ? 'opacity-50' : ''}`}
            >
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
                className="mono min-w-0 flex-1 bg-transparent px-3 text-ink outline-none"
              />
            </div>
            <p id="custom-slug-hint" className="body-small text-ink-muted">
              {!Number.isFinite(slugs.allowance) ? (
                'An advanced feature. Your plan covers every code. Leave empty for a random link. It can’t be changed after you create the code.'
              ) : slugsLeft === 0 ? (
                <>
                  <TrackEvent name="upgrade_prompt_shown" props={{ feature: 'custom_slug' }} />
                  An advanced feature: you’re using advanced features on {slugs.used} of{' '}
                  {slugs.allowance} {slugs.allowance === 1 ? 'code' : 'codes'}, so this code gets a
                  random link.{' '}
                  <a
                    href="/pricing#plans"
                    className="text-evergreen underline"
                    onClick={() => track('upgrade_prompt_clicked', { feature: 'custom_slug' })}
                  >
                    Choose a plan for more
                  </a>
                  .
                </>
              ) : (
                `An advanced feature: ${slugs.used} of ${slugs.allowance} ${slugs.allowance === 1 ? 'code' : 'codes'} used. Leave empty for a random link. It can’t be changed after you create the code.`
              )}
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
        <Button type="submit" variant="primary" disabled={!props.content.ok || pending}>
          {pending ? 'Creating…' : 'Create dynamic code'}
        </Button>
        <p className="body-small text-ink-muted" role={error ? 'alert' : undefined}>
          {error ??
            (!props.content.ok
              ? isCard
                ? 'Add a name or an organisation first.'
                : 'Add the destination first.'
              : props.scanFailed
                ? 'Fix the scan warning before you print. You can change the design after creating the code.'
                : isCard
                  ? 'You can update the contact details and design at any time. The short link stays the same.'
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
        <CreateStep
          props={p}
          folders={folders}
          slugs={slugs}
          shortLinkBase={shortLinkBase}
          fromHomepage={draft !== null}
        />
      )}
    />
  )
}
