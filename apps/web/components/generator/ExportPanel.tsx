'use client'

import { formatPrintSize } from '@qrfinity/core'
import { Download, Lock, Sticker } from 'lucide-react'
import Link from 'next/link'
import { useId, useState } from 'react'
import {
  MAX_RASTER_PX,
  downloadBlob,
  exportEps,
  exportJpg,
  exportPdf,
  exportPng,
  exportSvg,
  exportZip,
  printPixels,
  type ExportJob,
} from '@/lib/export'
import { track } from '@/lib/analytics'
import { useGenerator } from '@/lib/generator-context'
import { PRINT_PARTNER_URL } from '@/lib/partners'
import { useViewerPlan } from '@/lib/plan-client'
import { Button } from '../ui/Button'
import { SelectField } from '../ui/Field'

type PngSize = '512' | '1024' | '2048' | 'print'

export function ExportPanel({ job, scanFailed }: { job: ExportJob | null; scanFailed: boolean }) {
  const printWidthMm = useGenerator((s) => s.printWidthMm)
  const setPrintWidthMm = useGenerator((s) => s.setPrintWidthMm)
  const contentType = useGenerator((s) => s.type)
  const kind = useGenerator((s) => s.kind)
  const [pngSize, setPngSize] = useState<PngSize>('1024')
  const [busy, setBusy] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [downloaded, setDownloaded] = useState(false)
  const widthId = useId()
  const printPx = printPixels(printWidthMm)
  const disabled = !job || busy !== null
  const viewer = useViewerPlan()
  // SVG, PDF and EPS come with a paid plan. Until the plan is known, they look available.
  const vector = viewer === null || viewer.features.includes('vectorFormats')
  const [upsell, setUpsell] = useState(false)

  async function run(
    label: string,
    filename: string,
    make: (job: ExportJob) => Promise<Blob> | Blob,
  ) {
    if (!job) return
    setBusy(label)
    setStatus(null)
    try {
      downloadBlob(await make(job), filename)
      setStatus(`Downloaded ${filename}.`)
      setDownloaded(true)
      track('qr_downloaded', { format: label, content_type: contentType, kind })
    } catch {
      setStatus(`The ${label} could not be created in this browser. Try another format.`)
    } finally {
      setBusy(null)
    }
  }

  const base = job?.baseName ?? 'qr-code'
  const pngWidth = pngSize === 'print' ? printPx : Number(pngSize)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={widthId} className="label text-ink">
          Print width
        </label>
        <div className="flex items-center gap-3">
          <div className="relative w-32">
            <input
              id={widthId}
              type="number"
              inputMode="decimal"
              min={1}
              max={100}
              step={0.5}
              value={printWidthMm / 10}
              onChange={(e) => {
                const cm = Number(e.target.value)
                if (Number.isFinite(cm) && cm > 0)
                  setPrintWidthMm(Math.min(1000, Math.round(cm * 10)))
              }}
              className="w-full rounded-md border-[1.5px] border-control-border bg-surface py-2.5 pl-3 pr-10 text-ink"
              aria-describedby={`${widthId}-hint`}
            />
            <span className="body-small pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted">
              cm
            </span>
          </div>
          <span id={`${widthId}-hint`} className="body-small text-ink-muted">
            {(printWidthMm / 25.4).toFixed(1)} in. Sets the PDF and EPS size and the print PNG.
          </span>
        </div>
      </div>

      <SelectField
        label="PNG size"
        value={pngSize}
        onChange={setPngSize}
        options={[
          { value: '512', label: 'Small: 512 px' },
          { value: '1024', label: 'Medium: 1,024 px' },
          { value: '2048', label: 'Large: 2,048 px' },
          {
            value: 'print',
            label: `Print: ${formatPrintSize(printWidthMm)} at 300 dpi (${printPx.toLocaleString('en')} px)`,
          },
        ]}
        hint={
          pngSize === 'print' && printPx >= MAX_RASTER_PX
            ? `Capped at ${MAX_RASTER_PX.toLocaleString('en')} px. For larger prints, SVG, PDF and EPS scale to any size.`
            : undefined
        }
      />

      <Button
        variant="download"
        disabled={disabled}
        icon={<Download aria-hidden="true" size={18} strokeWidth={2} />}
        onClick={() => run('PNG', `${base}-${pngWidth}px.png`, (j) => exportPng(j, pngWidth))}
      >
        {busy === 'PNG' ? 'Preparing PNG…' : 'Download PNG'}
      </Button>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Button
          disabled={disabled}
          onClick={() => run('JPG', `${base}-${pngWidth}px.jpg`, (j) => exportJpg(j, pngWidth))}
        >
          JPG
        </Button>
        {(
          [
            ['SVG', `${base}.svg`, (j: ExportJob) => exportSvg(j)],
            ['PDF', `${base}.pdf`, exportPdf],
            ['EPS', `${base}.eps`, exportEps],
          ] as const
        ).map(([label, file, make]) =>
          vector ? (
            <Button key={label} disabled={disabled} onClick={() => run(label, file, make)}>
              {busy === label ? `${label}…` : label}
            </Button>
          ) : (
            <Button
              key={label}
              disabled={!job}
              aria-describedby={upsell ? `${widthId}-upsell` : undefined}
              icon={<Lock aria-hidden="true" size={16} strokeWidth={1.75} />}
              onClick={() => {
                setUpsell(true)
                track('upgrade_prompt_shown', { feature: 'vectorFormats' })
              }}
            >
              {label}
            </Button>
          ),
        )}
      </div>
      {upsell && !vector ? (
        <div
          id={`${widthId}-upsell`}
          role="status"
          className="flex flex-col gap-2 rounded-md border border-hairline bg-mint px-3 py-3"
        >
          <p className="body-small text-ink">
            <strong>SVG, PDF and EPS come with any paid plan</strong>, from $5 a month. They stay
            sharp at any print size. Your first month is free.
          </p>
          <Link href="/pricing" className="body-small font-bold text-evergreen underline">
            {viewer?.signedIn ? 'Choose a plan' : 'See plans'}
          </Link>
        </div>
      ) : null}
      <Button
        disabled={disabled}
        onClick={() =>
          run('zip file', vector ? `${base}-all-formats.zip` : `${base}-png-jpg.zip`, (j) =>
            exportZip(j, { vector }),
          )
        }
      >
        {busy === 'zip file'
          ? 'Preparing zip…'
          : vector
            ? 'All formats and sizes (.zip)'
            : 'PNG and JPG in every size (.zip)'}
      </Button>
      <p className="body-small text-ink-muted" aria-live="polite">
        {status ??
          (scanFailed
            ? 'Fix the scan warning before you print.'
            : vector
              ? 'No watermark, in every format.'
              : 'PNG and JPG are free, with no watermark and no sign-up.')}
      </p>
      {downloaded && PRINT_PARTNER_URL ? (
        <a
          href={PRINT_PARTNER_URL}
          target="_blank"
          rel="noopener"
          className="body-small inline-flex items-center gap-1.5 self-start text-evergreen underline"
        >
          <Sticker aria-hidden="true" size={16} strokeWidth={1.75} />
          Print your QR code as stickers or magnets
        </a>
      ) : null}
    </div>
  )
}
