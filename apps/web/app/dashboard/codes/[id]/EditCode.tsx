'use client'

import type { ContentType, Design } from '@qrfinity/core'
import type { CodeContent } from '@qrfinity/db'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { saveCodeAction } from '@/app/dashboard/actions'
import { ExportPanel } from '@/components/generator/ExportPanel'
import { Generator, type FinalStepProps } from '@/components/generator/Generator'
import { Button } from '@/components/ui/Button'

type Props = {
  id: string
  shortLink: string
  shortLinkBase: string
  content: { type: ContentType; fields: unknown }
  design: Design
  destination: string
  disabled: boolean
}

function SaveStep({
  p,
  saved,
  id,
  disabled,
}: {
  p: FinalStepProps
  saved: { destination: string; design: Design }
  id: string
  disabled: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const destination = p.content.ok ? p.content.payload : null
  const destinationChanged = !!destination && destination !== saved.destination
  const designChanged = JSON.stringify(p.design) !== JSON.stringify(saved.design)
  const dirty = destinationChanged || designChanged

  return (
    <>
      <div className="rounded-lg border border-hairline bg-surface p-4 shadow-card md:p-6">
        <h2 className="subheading mb-2 text-ink">3. Save changes</h2>
        {destinationChanged ? (
          <p className="body-small mb-3 break-all text-ink-muted">
            Scans will go to <strong className="font-bold text-ink">{destination}</strong> instead
            of {saved.destination}. The printed code stays the same.
          </p>
        ) : null}
        <Button
          variant="primary"
          className="w-full"
          disabled={disabled || !dirty || pending || (!destination && destinationChanged)}
          onClick={() =>
            start(async () => {
              setMessage(null)
              const r = await saveCodeAction(id, {
                ...(destinationChanged
                  ? {
                      destination: destination!,
                      content: { type: p.type, fields: p.fields[p.type] } as CodeContent,
                    }
                  : {}),
                ...(designChanged ? { design: p.design } : {}),
              })
              if (r.ok) {
                setMessage(
                  destinationChanged
                    ? 'Saved. Scans open the new link right away; a phone that just scanned it may take up to a minute.'
                    : 'Saved.',
                )
                router.refresh()
              } else setMessage(r.error)
            })
          }
        >
          {pending ? 'Saving…' : 'Save changes'}
        </Button>
        <p className="body-small mt-2 text-ink-muted" aria-live="polite">
          {disabled
            ? 'This code is turned off and can’t be edited.'
            : (message ?? (dirty ? 'You have unsaved changes.' : 'Everything is saved.'))}
        </p>
      </div>
      <div className="rounded-lg border border-hairline bg-surface p-4 shadow-card md:p-6">
        <h2 className="subheading mb-4 text-ink">Download</h2>
        <ExportPanel job={p.job} scanFailed={p.scanFailed} />
      </div>
    </>
  )
}

export function EditCode({
  id,
  shortLink,
  shortLinkBase,
  content,
  design,
  destination,
  disabled,
}: Props) {
  // What's saved on the server; router.refresh() after a save brings the new values in,
  // while the editor keeps its state (which now matches).
  const saved = { destination, design }
  return (
    <Generator
      init={{
        kind: 'dynamic',
        type: content.type,
        fields: { [content.type]: content.fields },
        design,
      }}
      shortLinkBase={shortLinkBase}
      shortLink={shortLink}
      contentTitle="1. Where the code sends people"
      finalStep={(p) => <SaveStep p={p} saved={saved} id={id} disabled={disabled} />}
    />
  )
}
