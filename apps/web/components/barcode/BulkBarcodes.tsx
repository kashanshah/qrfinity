'use client'

import {
  AMAZON_LABEL_SIZES,
  LABEL_CONDITIONS,
  MATRIX_FORMAT,
  bulkFileNames,
  checkBarcodeValue,
  checkMatrixValue,
  isMatrixType,
  parseBulk,
  sceneToSvg,
  type FnskuLabel,
} from '@qrfinity/core'
import { Crown, Download, Upload } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Checkbox, SelectField, TextArea } from '@/components/ui/Field'
import { track } from '@/lib/analytics'
import { buildBarcode } from '@/lib/barcode-build'
import {
  PAGE_SIZES,
  barcodePng,
  barcodesPdf,
  labelPng,
  labelsPdf,
  labelsZpl,
  pixelsPerModule,
  zipFiles,
  type BarcodeJob,
} from '@/lib/barcode-export'
import { BARCODE_INFO, BARCODE_ORDER, type AnyBarcode } from '@/lib/barcodes'
import { downloadBlob } from '@/lib/export'
import { useViewerPlan } from '@/lib/plan-client'
import { svgToCanvas } from '@/lib/raster'
import { decodeBarcodeImage } from '@/lib/scan'

const EXAMPLE: Partial<Record<AnyBarcode, string>> = {
  code128: 'SKU-1001\tBlue mug\nSKU-1002\tGreen mug\nSKU-1003\tRed mug',
  upca: '036000291452\n012345678905',
  ean13: '4006381333931\n5901234123457',
  fnsku: 'X001ABC2DE\tBamboo cutting board, large\nX002QRF1N7\tSteel water bottle, 750 ml',
}

const style = { showText: true, foreground: '#000000', background: '#ffffff', transparent: false }

export function BulkBarcodes() {
  const [type, setType] = useState<AnyBarcode>('code128')
  const [text, setText] = useState(EXAMPLE.code128!)
  const [showText, setShowText] = useState(true)
  const [labels, setLabels] = useState(false)
  const [sizeId, setSizeId] = useState(AMAZON_LABEL_SIZES[0]!.id)
  const [dpi, setDpi] = useState<203 | 300>(203)
  const [condition, setCondition] = useState<string>('New')
  const [page, setPage] = useState<keyof typeof PAGE_SIZES>('letter')
  const [busy, setBusy] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [upsell, setUpsell] = useState(false)
  const [preview, setPreview] = useState<{ key: string; svg: string; scans: boolean } | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const viewer = useViewerPlan()
  const vector = viewer === null || viewer.features.includes('vectorFormats')
  const info = BARCODE_INFO[type]
  const labelMode = type === 'fnsku' && labels
  const size = AMAZON_LABEL_SIZES.find((s) => s.id === sizeId) ?? AMAZON_LABEL_SIZES[0]!
  const thermal = !size.sheet

  // Every row checked as you type: fixable problems are listed with their line number.
  const parsed = useMemo(() => {
    const { rows, truncated } = parseBulk(text)
    const checked = rows.map((r) => {
      const c = isMatrixType(type)
        ? checkMatrixValue(type, r.value)
        : checkBarcodeValue(type, r.value)
      return { ...r, ...(c.ok ? { value: c.value, error: null } : { error: c.error }) }
    })
    return { rows: checked, ok: checked.filter((r) => !r.error), truncated }
  }, [text, type])

  // Preview and scan-test the first barcode.
  const firstKey = parsed.ok[0] ? `${type}|${showText}|${parsed.ok[0].value}` : null
  useEffect(() => {
    if (!firstKey || labelMode) return
    let live = true
    const first = parsed.ok[0]!
    void (async () => {
      const built = await buildBarcode(type, first.value, { ...style, showText }, 'preview')
      if (!built.ok || !live) return
      const { scene } = built.job
      const px = Math.min(2400, scene.width * (isMatrixType(type) ? 6 : 4))
      const h = Math.round((px * scene.height) / scene.width)
      const canvas = await svgToCanvas(sceneToSvg(scene, { width: px }), px, h, '#ffffff')
      const read = await decodeBarcodeImage(
        canvas.getContext('2d')!.getImageData(0, 0, px, h),
        isMatrixType(type) ? [MATRIX_FORMAT[type]] : undefined,
      ).catch(() => null)
      if (live)
        setPreview({ key: firstKey, svg: sceneToSvg(scene, { width: 480 }), scans: read !== null })
    })()
    return () => {
      live = false
    }
  }, [firstKey, labelMode]) // eslint-disable-line react-hooks/exhaustive-deps
  const shown = preview && preview.key === firstKey ? preview : null

  function pickType(next: AnyBarcode) {
    setType(next)
    if (EXAMPLE[next]) setText(EXAMPLE[next]!)
    setLabels(next === 'fnsku')
    setStatus(null)
  }

  async function loadFile(f: File) {
    if (f.size > 2_000_000) {
      setStatus('That file is over 2 MB. Split it into smaller files.')
      return
    }
    setText(await f.text())
    setStatus(`Loaded ${f.name}.`)
  }

  async function jobs(onEach: (n: number) => void) {
    const out: BarcodeJob[] = []
    for (const [i, r] of parsed.ok.entries()) {
      const built = await buildBarcode(type, r.value, { ...style, showText }, r.value)
      if (built.ok) out.push(built.job)
      onEach(i + 1)
    }
    return out
  }

  const fnskuLabels = (): FnskuLabel[] =>
    parsed.ok.map((r) => ({
      fnsku: r.value,
      title: r.extra,
      condition,
      size,
      ...(thermal ? { dpi } : {}),
    }))

  async function run(format: string, filename: string, make: () => Promise<Blob>) {
    setBusy(format)
    setStatus(null)
    try {
      downloadBlob(await make(), filename)
      setStatus(`Downloaded ${filename}.`)
      track('barcode_downloaded', {
        format: `bulk ${format}`,
        barcode_type: labelMode ? 'fnsku-label' : type,
      })
    } catch {
      setStatus(`The ${format} could not be created in this browser. Try fewer rows.`)
    } finally {
      setBusy(null)
    }
  }
  const progress = (label: string) => (n: number) =>
    setStatus(`${label}: ${n.toLocaleString('en')} of ${parsed.ok.length.toLocaleString('en')}…`)
  const showUpsell = () => {
    setUpsell(true)
    track('upgrade_prompt_shown', { feature: 'vectorFormats' })
  }

  const count = parsed.ok.length
  const problems = parsed.rows.filter((r) => r.error)
  const disabled = busy !== null || count === 0

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
      <div className="flex flex-col gap-5 rounded-lg border border-hairline bg-surface p-4 shadow-card md:p-6">
        <SelectField
          label="Barcode type"
          value={type}
          onChange={pickType}
          options={BARCODE_ORDER.map((t) => ({
            value: t,
            label: `${BARCODE_INFO[t].name}: ${BARCODE_INFO[t].use}`,
          }))}
        />
        <TextArea
          label="Values, one per line"
          rows={8}
          value={text}
          spellCheck={false}
          onChange={(e) => setText(e.target.value)}
          hint={
            type === 'fnsku'
              ? 'Paste two columns from your spreadsheet: FNSKU, then product title.'
              : `Paste a column from your spreadsheet. A second column, if any, names each file. ${info.hint}`
          }
        />
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={file}
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            className="sr-only"
            aria-label="Choose a CSV file"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void loadFile(f)
              e.target.value = ''
            }}
          />
          <Button
            icon={<Upload aria-hidden="true" size={18} strokeWidth={1.75} />}
            onClick={() => file.current?.click()}
          >
            Open a CSV file
          </Button>
          <p className="body-small text-ink-muted">Up to 1,000 rows. Nothing is uploaded.</p>
        </div>

        {type === 'fnsku' ? (
          <Checkbox
            label="Make Amazon FBA labels (barcode, title and condition)"
            checked={labels}
            onChange={setLabels}
          />
        ) : null}
        {labelMode ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Label size"
              value={sizeId}
              onChange={setSizeId}
              options={AMAZON_LABEL_SIZES.map((s) => ({ value: s.id, label: s.name }))}
            />
            <SelectField
              label="Condition"
              value={condition}
              onChange={setCondition}
              options={LABEL_CONDITIONS.map((c) => ({ value: c, label: c }))}
            />
            {thermal ? (
              <SelectField
                label="Printer resolution"
                value={String(dpi) as '203' | '300'}
                onChange={(v) => setDpi(Number(v) as 203 | 300)}
                options={[
                  { value: '203', label: '203 dpi' },
                  { value: '300', label: '300 dpi' },
                ]}
              />
            ) : null}
          </div>
        ) : isMatrixType(type) ? null : (
          <Checkbox
            label="Show the number under the bars"
            checked={showText}
            onChange={setShowText}
          />
        )}

        {problems.length ? (
          <div role="status" className="rounded-md border-[1.5px] border-scan-fail px-4 py-3">
            <p className="text-ink">
              {problems.length.toLocaleString('en')}{' '}
              {problems.length === 1 ? 'row needs' : 'rows need'} fixing; they’re left out of the
              downloads.
            </p>
            <ul className="body-small mt-2 flex flex-col gap-1 text-ink-muted">
              {problems.slice(0, 12).map((r) => (
                <li key={r.line}>
                  <span className="font-bold text-ink">Line {r.line}</span> ({r.value}): {r.error}
                </li>
              ))}
              {problems.length > 12 ? <li>…and {problems.length - 12} more.</li> : null}
            </ul>
          </div>
        ) : null}
        {parsed.truncated ? (
          <p className="body-small text-ink">
            Only the first 1,000 rows are used. Split the list to make more.
          </p>
        ) : null}
      </div>

      <aside aria-label="Your barcodes" className="flex flex-col gap-4 lg:sticky lg:top-6">
        <div className="rounded-lg border border-hairline bg-surface p-4 shadow-card">
          <p className="subheading text-ink">
            {count.toLocaleString('en')} {count === 1 ? 'barcode' : 'barcodes'} ready
          </p>
          {shown && !labelMode ? (
            <>
              <div
                className="mt-3 flex items-center justify-center rounded-md bg-white p-3"
                // The SVG comes from our own renderer, which escapes every value.
                dangerouslySetInnerHTML={{
                  __html: shown.svg.replace(
                    '<svg ',
                    '<svg role="img" aria-label="First barcode" style="max-width:100%;height:auto" ',
                  ),
                }}
              />
              <p className="body-small mt-2 text-ink-muted">
                {shown.scans
                  ? 'First barcode scan-tested: it reads correctly.'
                  : 'The first barcode didn’t read back. Check the values.'}
              </p>
            </>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-hairline bg-surface p-4 shadow-card">
          {labelMode ? (
            <>
              <Button
                variant="download"
                disabled={disabled}
                icon={<Download aria-hidden="true" size={18} strokeWidth={2} />}
                onClick={() => {
                  const ls = fnskuLabels()
                  const names = bulkFileNames(
                    ls.map((l, i) => ({
                      value: l.fnsku,
                      extra: parsed.ok[i]!.extra ? `${l.fnsku}-${parsed.ok[i]!.extra}` : '',
                    })),
                    'png',
                  )
                  void run('label PNGs', 'fnsku-labels.zip', () =>
                    zipFiles(
                      ls.map((l, i) => ({ name: names[i]!, make: () => labelPng(l) })),
                      progress('Drawing labels'),
                    ),
                  )
                }}
              >
                {busy === 'label PNGs'
                  ? 'Preparing…'
                  : `${count.toLocaleString('en')} labels as PNG (.zip)`}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                {vector ? (
                  <Button
                    disabled={disabled}
                    onClick={() =>
                      void run('label PDF', 'fnsku-labels.pdf', () =>
                        labelsPdf(fnskuLabels(), 'FNSKU labels'),
                      )
                    }
                  >
                    PDF
                  </Button>
                ) : (
                  <PaidButton label="PDF" onClick={showUpsell} />
                )}
                {thermal ? (
                  vector ? (
                    <Button
                      disabled={disabled}
                      onClick={() =>
                        void run('ZPL', `fnsku-labels-${dpi}dpi.zpl`, async () =>
                          labelsZpl(fnskuLabels().map((l) => ({ ...l, dpi }))),
                        )
                      }
                    >
                      Zebra (ZPL)
                    </Button>
                  ) : (
                    <PaidButton label="Zebra (ZPL)" onClick={showUpsell} />
                  )
                ) : null}
              </div>
            </>
          ) : (
            <>
              <Button
                variant="download"
                disabled={disabled}
                icon={<Download aria-hidden="true" size={18} strokeWidth={2} />}
                onClick={() => {
                  const names = bulkFileNames(parsed.ok, 'png')
                  void run('PNGs', `${info.slug}-barcodes.zip`, async () => {
                    const all = await jobs(progress('Drawing'))
                    return zipFiles(
                      all.map((job, i) => ({
                        name: names[i]!,
                        make: () => barcodePng(job, pixelsPerModule(job, 300)),
                      })),
                      progress('Saving PNGs'),
                    )
                  })
                }}
              >
                {busy === 'PNGs'
                  ? 'Preparing…'
                  : `${count.toLocaleString('en')} PNGs at print size (.zip)`}
              </Button>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
                <SelectField
                  label="PDF page"
                  value={page}
                  onChange={setPage}
                  options={[
                    { value: 'letter', label: 'US Letter' },
                    { value: 'a4', label: 'A4' },
                  ]}
                />
                {vector ? (
                  <Button
                    disabled={disabled}
                    onClick={() =>
                      void run('PDF', `${info.slug}-barcodes.pdf`, async () =>
                        barcodesPdf(await jobs(progress('Drawing')), page, `${info.name} barcodes`),
                      )
                    }
                  >
                    PDF
                  </Button>
                ) : (
                  <PaidButton label="PDF" onClick={showUpsell} />
                )}
              </div>
            </>
          )}
          {upsell && !vector ? (
            <div
              role="status"
              className="flex flex-col gap-2 rounded-md border border-hairline bg-mint px-3 py-3"
            >
              <p className="body-small text-ink">
                <strong>PDF and Zebra files come with any paid plan</strong>, from $5 a month. Your
                first month is free.
              </p>
              <Link href="/pricing" className="body-small font-bold text-evergreen underline">
                {viewer?.signedIn ? 'Choose a plan' : 'See plans'}
              </Link>
            </div>
          ) : null}
          <p className="body-small text-ink-muted" aria-live="polite">
            {status ??
              'Made in your browser: your list never leaves this page. PNGs are free, with no watermark.'}
          </p>
        </div>
      </aside>
    </div>
  )
}

function PaidButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <span className="relative flex">
      <Button className="w-full" aria-label={`${label}, with a paid plan`} onClick={onClick}>
        {label}
      </Button>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full border border-hairline bg-surface text-ink shadow-card"
      >
        <Crown size={14} strokeWidth={2} />
      </span>
    </span>
  )
}
