'use client'

import {
  PayloadTooLongError,
  buildScene,
  checkDesign,
  encodeContent,
  formatPrintSize,
  isPageType,
  sceneToSvg,
  validateDestination,
  type ContentFields,
  type ContentType,
  type Design,
  type EncodeResult,
  type SceneInfo,
} from '@qrfinity/core'
import { useId, useMemo, type ReactNode } from 'react'
import { useAutoLogo } from '@/lib/brand-logo'
import type { ExportJob } from '@/lib/export'
import { GeneratorProvider, useGenerator } from '@/lib/generator-context'
import { useScanCheck } from '@/lib/scan'
import { DYNAMIC_TYPES, type CodeKind, type GeneratorInit } from '@/lib/store'
import { OptionGroup } from '../ui/OptionGroup'
import { CodeTypeBadge, NeverExpiresBadge } from './Badges'
import { CONTENT_TYPE_OPTIONS, ContentForm } from './ContentForm'
import { DesignPanel } from './DesignPanel'
import { HomeFinalStep } from './HomeFinalStep'
import { ScanResult, type ScanSummary } from './ScanResult'

export type FinalStepProps = {
  kind: CodeKind
  type: ContentType
  fields: ContentFields
  design: Design
  /** Static: the encoded payload. Dynamic: the destination address. */
  content: EncodeResult
  job: ExportJob | null
  scanFailed: boolean
}

export type GeneratorProps = {
  init?: GeneratorInit
  /** Show the static / dynamic choice (homepage). */
  kindChoice?: boolean
  /** Origin of dynamic short links, e.g. https://qrfinity.link. */
  shortLinkBase: string
  /** The real short link, once the dynamic code exists. */
  shortLink?: string
  contentTitle?: string
  finalStep?: (props: FinalStepProps) => ReactNode
  /**
   * Restyling a code made elsewhere: the content can't change, so step 1 shows `panel` instead of
   * the content form, and `note` replaces the static/dynamic explanation (and the never-expires
   * badge, since what the code opens may still expire in its app).
   */
  fixedContent?: { panel: ReactNode; note: ReactNode }
}

export function Generator(props: GeneratorProps) {
  return (
    <GeneratorProvider init={props.init}>
      <GeneratorBody {...props} />
    </GeneratorProvider>
  )
}

// Same length as a real slug, so the preview is exactly as dense as the final code.
const PLACEHOLDER_SLUG = 'aB3xK9q'

// Which field shows a dynamic-destination problem, per content type.
const PRIMARY_FIELD: Partial<Record<ContentType, string>> = {
  url: 'url',
  app: 'url',
  social: 'handle',
  whatsapp: 'phone',
  location: 'address',
}

type Render =
  | {
      kind: 'ok'
      payload: string
      svg: string
      job: Omit<ExportJob, 'printWidthMm'>
      info: SceneInfo
    }
  | { kind: 'empty' | 'invalid' | 'too-long' }

function failMessage(design: Design, info: SceneInfo): ScanSummary['message'] {
  if (design.logo && info.logoCoverage > 0.12) {
    return { text: 'The logo covers too much of the code.', strong: 'Make the logo smaller.' }
  }
  if (design.quietZone < 2) {
    return { text: 'The code needs more empty space around it.', strong: 'Increase the margin.' }
  }
  return {
    text: 'Cameras can’t read this design.',
    strong: 'Try the square pattern, stronger contrast or a smaller logo.',
  }
}

function GeneratorBody({
  kindChoice = false,
  shortLinkBase,
  shortLink,
  contentTitle,
  finalStep,
  fixedContent,
}: GeneratorProps) {
  const kind = useGenerator((s) => s.kind)
  const setKind = useGenerator((s) => s.setKind)
  const type = useGenerator((s) => s.type)
  const setType = useGenerator((s) => s.setType)
  const fields = useGenerator((s) => s.fields)
  const design = useGenerator((s) => s.design)
  const printWidthMm = useGenerator((s) => s.printWidthMm)
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  useAutoLogo()

  const content = useMemo<EncodeResult>(() => {
    const r = encodeContent(type, fields[type])
    if (kind === 'static' || !r.ok) return r
    // A dynamic contact card is a page on the short domain: its encoded card is the content.
    if (isPageType(type)) return r
    // Other dynamic codes redirect, so the content must be a safe web address.
    const d = validateDestination(r.payload, [new URL(shortLinkBase).hostname, 'qrfinity.link'])
    return d.ok
      ? { ok: true, payload: d.url }
      : { ok: false, reason: 'invalid', errors: { [PRIMARY_FIELD[type] ?? 'url']: d.message } }
  }, [kind, type, fields, shortLinkBase])

  const payload =
    kind === 'dynamic'
      ? (shortLink ?? `${shortLinkBase}/${PLACEHOLDER_SLUG}`)
      : content.ok
        ? content.payload
        : null

  const render = useMemo<Render>(() => {
    if (!payload) return { kind: content.ok ? 'empty' : content.reason }
    try {
      const { scene, info } = buildScene(payload, design)
      return {
        kind: 'ok',
        payload,
        svg: sceneToSvg(scene, { width: 600 }),
        info,
        job: {
          scene,
          design,
          baseName: kind === 'dynamic' ? 'qr-code-dynamic' : `qr-code-${type}`,
        },
      }
    } catch (e) {
      if (e instanceof PayloadTooLongError) return { kind: 'too-long' }
      throw e
    }
  }, [payload, content, design, type, kind])

  const ok = render.kind === 'ok' ? render : null
  const scan = useScanCheck(
    ok?.svg ?? null,
    ok ? ok.job.scene.height / ok.job.scene.width : 1,
    ok ? ok.job.scene.width : 0,
  )

  const summary = useMemo<ScanSummary | null>(() => {
    if (!ok) return null
    const checks = checkDesign(design, ok.info, printWidthMm)
    if (scan.status === 'checking')
      return { state: 'checking', message: { text: '' }, warnings: [] }
    const blocker = checks.blockers[0]
    if (blocker)
      return {
        state: 'fail',
        message: { text: blocker.message, strong: blocker.strong },
        warnings: checks.warnings,
      }
    if (scan.decoded !== ok.payload)
      return { state: 'fail', message: failMessage(design, ok.info), warnings: checks.warnings }
    return {
      state: 'pass',
      message: { text: 'Print it at least', strong: `${formatPrintSize(checks.minPrintMm)} wide.` },
      warnings: checks.warnings,
    }
  }, [ok, design, printWidthMm, scan])

  const job: ExportJob | null = ok ? { ...ok.job, printWidthMm } : null
  const scanFailed = summary?.state === 'fail'

  // Each inline copy gets its own gradient ids; a shared id would resolve to the hidden copy.
  const previewSvg = useMemo(
    () =>
      ok
        ? {
            compact: sceneToSvg(ok.job.scene, { width: 600, idPrefix: `${uid}c` }),
            full: sceneToSvg(ok.job.scene, { width: 600, idPrefix: `${uid}f` }),
          }
        : null,
    [ok, uid],
  )

  const typeOptions =
    kind === 'dynamic'
      ? CONTENT_TYPE_OPTIONS.filter((o) => DYNAMIC_TYPES.includes(o.value))
      : CONTENT_TYPE_OPTIONS
  const linkLabel = shortLink
    ? shortLink.replace(/^https?:\/\//, '')
    : `${new URL(shortLinkBase).host}/·······`

  const preview = (compact: boolean) => (
    <div className={`rounded-xl bg-surface-sunk ${compact ? 'p-3' : 'p-6'}`}>
      {ok ? (
        <div
          className={`qr-render mx-auto ${compact ? 'w-28' : 'w-full max-w-[360px]'}`}
          role="img"
          aria-label="QR code preview"
          // The SVG is generated by our renderer; text and image sources are escaped and validated there.
          dangerouslySetInnerHTML={{ __html: compact ? previewSvg!.compact : previewSvg!.full }}
        />
      ) : (
        <div
          className={`mx-auto flex aspect-square items-center justify-center rounded-lg border-2 border-dashed border-hairline text-center ${compact ? 'w-28 p-2' : 'w-full max-w-[360px] p-8'}`}
        >
          <p className="body-small text-ink-muted">
            {render.kind === 'too-long'
              ? 'That’s more than a QR code can hold. Shorten it.'
              : render.kind === 'invalid'
                ? 'Check the highlighted field.'
                : 'Fill in the details to see your code.'}
          </p>
        </div>
      )}
    </div>
  )

  const badges = (
    <div className="flex flex-wrap items-center gap-2">
      <CodeTypeBadge type={kind} />
      {fixedContent ? null : <NeverExpiresBadge />}
      {kind === 'dynamic' ? <span className="mono text-evergreen">{linkLabel}</span> : null}
    </div>
  )

  const stepProps: FinalStepProps = { kind, type, fields, design, content, job, scanFailed }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start xl:grid-cols-[minmax(0,1fr)_440px]">
      {/* Phones: a compact preview stays in view while editing. */}
      <div className="sticky top-0 z-10 -mx-4 border-b border-hairline bg-ground/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center gap-4">
          {preview(true)}
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              <CodeTypeBadge type={kind} />
              {fixedContent ? null : <NeverExpiresBadge />}
            </div>
            {summary ? <ScanResult summary={{ ...summary, warnings: [] }} /> : null}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <section
          aria-labelledby="step-content"
          className="rounded-lg border border-hairline bg-surface p-4 shadow-card md:p-6"
        >
          <h2 id="step-content" className="subheading mb-4 text-ink">
            {contentTitle ?? '1. What should the code open?'}
          </h2>
          {fixedContent ? (
            fixedContent.panel
          ) : (
            <div className="flex flex-col gap-6">
              {kindChoice ? (
                <OptionGroup
                  label="Type of code"
                  value={kind}
                  onChange={setKind}
                  columns="grid-cols-1 sm:grid-cols-2"
                  options={[
                    { value: 'static', label: 'Static: free, no sign-up, can’t be edited' },
                    { value: 'dynamic', label: 'Dynamic: editable, with scan stats, free account' },
                  ]}
                />
              ) : null}
              <OptionGroup
                label="Content type"
                hideLabel
                value={type}
                onChange={setType}
                columns="grid-cols-3 sm:grid-cols-4 xl:grid-cols-6"
                options={typeOptions}
              />
              <ContentForm result={content} />
            </div>
          )}
        </section>

        <section
          aria-labelledby="step-design"
          className="rounded-lg border border-hairline bg-surface p-4 shadow-card md:p-6"
        >
          <h2 id="step-design" className="subheading mb-2 text-ink">
            2. Make it yours
          </h2>
          <DesignPanel />
        </section>
      </div>

      <aside aria-label="Your QR code" className="flex flex-col gap-6 lg:sticky lg:top-6">
        <div className="flex flex-col gap-4 rounded-lg border border-hairline bg-surface p-4 shadow-card md:p-6">
          <div className="hidden flex-col gap-4 lg:flex">
            {preview(false)}
            {summary ? <ScanResult summary={summary} live /> : null}
          </div>
          {/* Phones see the full warning list here, below the sticky summary. */}
          {summary && summary.warnings.length ? (
            <div className="lg:hidden">
              <ScanResult summary={summary} />
            </div>
          ) : null}
          <div className="flex flex-col gap-2 border-t border-hairline pt-4">
            {badges}
            <p className="body-small text-ink-muted">
              {fixedContent
                ? fixedContent.note
                : kind === 'static'
                  ? 'The content is stored in the code itself, so it works forever without us. It can’t be edited or tracked after printing.'
                  : type === 'vcard'
                    ? 'The code holds a short link to your contact page, with a Save contact button. Update your details any time; the printed code keeps working and is never deactivated.'
                    : shortLink
                      ? 'The code holds this short link. Change where it goes any time; the printed code keeps working and is never deactivated.'
                      : 'The code holds a short link that sends people to your destination. Change it any time and see scan stats. Free with an account, never deactivated.'}
            </p>
          </div>
        </div>
        {(finalStep ?? ((p: FinalStepProps) => <HomeFinalStep {...p} />))(stepProps)}
      </aside>
    </div>
  )
}
