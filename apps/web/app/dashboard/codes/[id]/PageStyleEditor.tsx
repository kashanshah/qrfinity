'use client'

import {
  PAGE_TEMPLATES,
  PAGE_TEMPLATE_LABEL,
  renderContactPage,
  resolveAccent,
  type PageStyle,
  type PageTemplate,
  type VcardFields,
} from '@qrfinity/core'
import { AlignCenter, AlignLeft, IdCard, Palette, PanelTop, type LucideIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { setPageStyleAction } from '@/app/dashboard/actions'
import { Button } from '@/components/ui/Button'
import { ColorField } from '@/components/ui/ColorField'
import { Checkbox } from '@/components/ui/Field'
import { OptionGroup } from '@/components/ui/OptionGroup'

const ICON: Record<PageTemplate, LucideIcon> = {
  classic: IdCard,
  banner: PanelTop,
  centered: AlignCenter,
  minimal: AlignLeft,
}

const pill = (on: boolean) =>
  `label rounded-md px-3 py-2 ${on ? 'bg-mint font-bold text-ink' : 'text-ink-muted hover:bg-surface-sunk hover:text-ink'}`

/** Template and accent colour for a contact card's page, with a live preview. */
export function PageStyleEditor({
  id,
  slug,
  fields,
  style,
  codeColor,
  disabled,
}: {
  id: string
  slug: string
  fields: VcardFields
  style: PageStyle
  /** The printed code's colour, which the accent matches by default. */
  codeColor: string
  disabled: boolean
}) {
  const router = useRouter()
  const [template, setTemplate] = useState<PageTemplate>(style.template)
  const [accent, setAccent] = useState<string | null>(style.accent)
  const [scheme, setScheme] = useState<'light' | 'dark'>('light')
  const [message, setMessage] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const dirty = template !== style.template || accent !== style.accent
  const shown = resolveAccent(accent, codeColor)

  const preview = useMemo(
    () =>
      renderContactPage({
        fields,
        style: { template, accent },
        accent: shown,
        slug,
        siteOrigin: '',
        scheme,
      }),
    [fields, template, accent, shown, slug, scheme],
  )

  const save = () =>
    start(async () => {
      setMessage(null)
      const r = await setPageStyleAction(id, { template, accent })
      if (!r.ok) setMessage(r.error)
      else {
        setMessage('Saved. Scans show the new look right away.')
        router.refresh()
      }
    })

  return (
    <section
      aria-labelledby="page-style"
      className="rounded-lg border border-hairline bg-surface p-4 md:p-6"
    >
      <div className="flex items-start gap-3">
        <Palette
          aria-hidden="true"
          size={20}
          strokeWidth={1.75}
          className="mt-1 shrink-0 text-evergreen"
        />
        <div>
          <h2 id="page-style" className="subheading text-ink">
            Contact page look
          </h2>
          <p className="mt-1 max-w-[65ch] text-ink-muted">
            What people see when they scan the code. It follows their phone’s light or dark mode.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-5">
          <OptionGroup
            label="Template"
            value={template}
            columns="grid-cols-2 sm:grid-cols-4"
            onChange={(t) => {
              setTemplate(t)
              setMessage(null)
            }}
            options={PAGE_TEMPLATES.map((t) => {
              const Icon = ICON[t]
              return {
                value: t,
                label: PAGE_TEMPLATE_LABEL[t].name,
                icon: <Icon aria-hidden="true" size={22} strokeWidth={1.75} />,
              }
            })}
          />
          <p className="body-small -mt-3 text-ink-muted">{PAGE_TEMPLATE_LABEL[template].hint}.</p>

          <div className="flex flex-col gap-3">
            <Checkbox
              label="Match the QR code’s colour"
              hint={
                accent === null
                  ? 'Black or grey codes use QRfinity green. Colours are adjusted where needed so text stays readable.'
                  : undefined
              }
              checked={accent === null}
              onChange={(on) => {
                setAccent(on ? null : shown)
                setMessage(null)
              }}
            />
            {accent !== null ? (
              <ColorField
                label="Accent colour"
                value={accent}
                onChange={(hex) => {
                  setAccent(hex)
                  setMessage(null)
                }}
              />
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" disabled={disabled || !dirty || pending} onClick={save}>
              {pending ? 'Saving…' : 'Save look'}
            </Button>
            <p className="body-small text-ink-muted" aria-live="polite">
              {message ?? (dirty ? 'You have unsaved changes.' : '')}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="label text-ink">Preview</span>
            <div role="group" aria-label="Preview colour scheme" className="flex gap-1">
              <button
                type="button"
                className={pill(scheme === 'light')}
                aria-pressed={scheme === 'light'}
                onClick={() => setScheme('light')}
              >
                Light
              </button>
              <button
                type="button"
                className={pill(scheme === 'dark')}
                aria-pressed={scheme === 'dark'}
                onClick={() => setScheme('dark')}
              >
                Dark
              </button>
            </div>
          </div>
          {/* Sandboxed: the preview can't run scripts or navigate this page. */}
          <iframe
            title="Contact page preview"
            srcDoc={preview}
            sandbox=""
            className="h-[560px] w-full rounded-lg border border-hairline bg-ground"
          />
        </div>
      </div>
    </section>
  )
}
