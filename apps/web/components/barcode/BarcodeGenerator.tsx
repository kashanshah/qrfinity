'use client'

import {
  AMAZON_LABEL_SIZES,
  DEFAULT_BAR_HEIGHT,
  DEFAULT_HEIGHT_MM,
  LABEL_CONDITIONS,
  NOMINAL_WIDTH_MM,
  checkBarcodeValue,
  fnskuLabelScene,
  renderBarcode,
  sceneToSvg,
  type BarcodeType,
  type FnskuLabel,
  type Scene,
} from '@qrfinity/core'
import { Crown, Download } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useId, useMemo, useState } from 'react'
import { ScanResult, type ScanSummary } from '@/components/generator/ScanResult'
import { Button } from '@/components/ui/Button'
import { ColorField } from '@/components/ui/ColorField'
import { Checkbox, SelectField, TextField } from '@/components/ui/Field'
import { track } from '@/lib/analytics'
import {
  barcodeEps,
  barcodeJpg,
  barcodePdf,
  barcodePng,
  barcodeSvg,
  labelPdf,
  labelPng,
  labelZpl,
  pixelsPerModule,
  type BarcodeJob,
} from '@/lib/barcode-export'
import { BARCODE_INFO, BARCODE_ORDER } from '@/lib/barcodes'
import { downloadBlob } from '@/lib/export'
import { useViewerPlan } from '@/lib/plan-client'
import { svgToCanvas } from '@/lib/raster'
import { decodeBarcodeImage } from '@/lib/scan'

/** A module of 0.33 mm is the retail standard (100%) and a good default for every type. */
const DEFAULT_MODULE_MM = 0.33
const MIN_MODULE_MM = 0.19

type PngSize = 'screen' | 'large' | 'print'
type Mode = 'barcode' | 'label'

const style = (
  type: BarcodeType,
  o: { showText: boolean; fg: string; bg: string; transparent: boolean },
  barHeight = DEFAULT_BAR_HEIGHT[type],
) => ({
  barHeight,
  showText: o.showText,
  foreground: o.fg,
  background: o.bg,
  transparent: o.transparent,
})

/** Width (mm) a barcode prints at by default: the standard size where one exists, else 0.33 mm per module. */
function defaultWidthMm(type: BarcodeType, sceneWidth: number) {
  return NOMINAL_WIDTH_MM[type] ?? Math.round(sceneWidth * DEFAULT_MODULE_MM * 10) / 10
}

/** Rasterises a scene and asks the decoder what it reads. */
async function readScene(scene: Scene, px: number): Promise<string | null> {
  const width = Math.round(px)
  const height = Math.round((px * scene.height) / scene.width)
  const canvas = await svgToCanvas(sceneToSvg(scene, { width }), width, height, '#ffffff')
  const image = canvas.getContext('2d')!.getImageData(0, 0, width, height)
  return decodeBarcodeImage(image)
}

/** A scanner reads UPC codes in their EAN-13 form; both mean the same number. */
function sameNumber(type: BarcodeType, read: string, value: string) {
  if (read === value) return true
  if (type === 'upca') return read === `0${value}`
  if (type === 'upce') return read.length === 13 && read.endsWith(value.slice(-1))
  return false
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

export function BarcodeGenerator({ initialType }: { initialType: BarcodeType }) {
  const [type, setType] = useState<BarcodeType>(initialType)
  const [input, setInput] = useState(BARCODE_INFO[initialType].example)
  const [showText, setShowText] = useState(true)
  const [fg, setFg] = useState('#000000')
  const [bg, setBg] = useState('#ffffff')
  const [transparent, setTransparent] = useState(false)
  const [widthMm, setWidthMm] = useState<number | null>(null)
  const [heightMm, setHeightMm] = useState<number | null>(null)
  const [mode, setMode] = useState<Mode>(initialType === 'fnsku' ? 'label' : 'barcode')
  const [title, setTitle] = useState('')
  const [condition, setCondition] = useState<string>('New')
  const [sizeId, setSizeId] = useState(AMAZON_LABEL_SIZES[0]!.id)
  const [dpi, setDpi] = useState<203 | 300>(203)
  const [copies, setCopies] = useState(1)
  const [pngSize, setPngSize] = useState<PngSize>('print')
  const [busy, setBusy] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [upsell, setUpsell] = useState(false)
  // The result is kept with the drawing it checked; a newer drawing shows “checking” until its own result.
  const [scanResult, setScanResult] = useState<{ svg: string; summary: ScanSummary } | null>(null)
  const id = useId()
  const viewer = useViewerPlan()
  // SVG, PDF, EPS and ZPL come with a paid plan. Until the plan is known, they look available.
  const vector = viewer === null || viewer.features.includes('vectorFormats')

  const info = BARCODE_INFO[type]
  const checked = useMemo(() => checkBarcodeValue(type, input), [type, input])
  const labelMode = type === 'fnsku' && mode === 'label'
  const size = AMAZON_LABEL_SIZES.find((s) => s.id === sizeId) ?? AMAZON_LABEL_SIZES[0]!
  const thermal = !size.sheet

  // The barcode, sized: height in mm becomes modules once the width (and so the module size) is known.
  const built = useMemo(() => {
    if (!checked.ok) return null
    const o = { showText, fg, bg, transparent }
    const first = renderBarcode(type, checked.value, style(type, o), checked.above)
    const w = widthMm ?? defaultWidthMm(type, first.scene.width)
    const moduleMm = w / first.scene.width
    const h = heightMm ?? DEFAULT_HEIGHT_MM[type]
    const { scene } = renderBarcode(
      type,
      checked.value,
      style(type, o, Math.max(5, h / moduleMm)),
      checked.above,
    )
    return { scene, widthMm: w, heightMm: h, moduleMm }
  }, [checked, type, showText, fg, bg, transparent, widthMm, heightMm])

  const label: FnskuLabel | null = useMemo(
    () =>
      checked.ok && type === 'fnsku'
        ? { fnsku: checked.value, title, condition, size, ...(thermal ? { dpi } : {}) }
        : null,
    [checked, type, title, condition, size, thermal, dpi],
  )
  const labelScene = useMemo(
    () => (labelMode && label ? fnskuLabelScene(label).scene : null),
    [labelMode, label],
  )

  const previewScene = labelMode ? labelScene : (built?.scene ?? null)
  const previewSvg = previewScene
    ? sceneToSvg(previewScene, { width: 600, idPrefix: id.replace(/:/g, '') })
    : null
  const scan: ScanSummary =
    scanResult && scanResult.svg === previewSvg
      ? scanResult.summary
      : { state: 'checking', message: { text: '' }, warnings: [] }

  // Scan check: draw it and read it back, like a phone camera or a store scanner would.
  useEffect(() => {
    if (!previewScene || !checked.ok) return
    let live = true
    const svg = previewSvg!
    const t = setTimeout(async () => {
      const px = labelMode ? 900 : Math.min(2400, previewScene.width * 4)
      const read = await readScene(previewScene, px).catch(() => null)
      if (!live) return
      const ok = read !== null && sameNumber(type, read, checked.value)
      const lowContrast = !labelMode && fg.toLowerCase() === bg.toLowerCase()
      const summary: ScanSummary = ok
        ? {
            state: 'pass',
            message: { text: 'Scans and reads', strong: read! },
            warnings:
              !labelMode && built && built.moduleMm < MIN_MODULE_MM
                ? [
                    {
                      id: 'too-small',
                      message: `Bars are ${built.moduleMm.toFixed(2)} mm at their narrowest; below ${MIN_MODULE_MM} mm many printers and scanners struggle.`,
                      strong: 'Make it wider.',
                    },
                  ]
                : [],
          }
        : {
            state: 'fail',
            message: {
              text: lowContrast
                ? 'The bars and background are the same colour.'
                : 'This barcode didn’t read back. Use dark bars on a light background, and keep the text short.',
            },
            warnings: [],
          }
      setScanResult({ svg, summary })
    }, 250)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [previewSvg]) // eslint-disable-line react-hooks/exhaustive-deps

  function pickType(next: BarcodeType) {
    setType(next)
    setInput(BARCODE_INFO[next].example)
    setWidthMm(null)
    setHeightMm(null)
    setMode(next === 'fnsku' ? 'label' : 'barcode')
    setStatus(null)
  }

  const base =
    `${info.slug}-${checked.ok ? checked.value.replace(/[^A-Za-z0-9-]+/g, '-') : 'barcode'}`.slice(
      0,
      60,
    )

  async function run(format: string, filename: string, make: () => Promise<Blob> | Blob) {
    setBusy(format)
    setStatus(null)
    try {
      downloadBlob(await make(), filename)
      setStatus(`Downloaded ${filename}.`)
      track('barcode_downloaded', { format, barcode_type: labelMode ? 'fnsku-label' : type })
    } catch {
      setStatus(`The ${format} could not be created in this browser. Try another format.`)
    } finally {
      setBusy(null)
    }
  }
  const showUpsell = () => {
    setUpsell(true)
    track('upgrade_prompt_shown', { feature: 'vectorFormats' })
  }

  const job: BarcodeJob | null = built
    ? {
        scene: built.scene,
        widthMm: built.widthMm,
        matte: transparent ? '#ffffff' : bg,
        baseName: base,
      }
    : null
  const ppm = job
    ? pngSize === 'screen'
      ? 3
      : pngSize === 'large'
        ? 8
        : pixelsPerModule(job, 300)
    : 1
  const nominal = NOMINAL_WIDTH_MM[type]
  const disabled = busy !== null || scan.state === 'checking'

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start">
      <div className="flex flex-col gap-6 rounded-lg border border-hairline bg-surface p-4 shadow-card md:p-6">
        <SelectField
          label="Barcode type"
          value={type}
          onChange={pickType}
          options={BARCODE_ORDER.map((t) => ({
            value: t,
            label: `${BARCODE_INFO[t].name}: ${BARCODE_INFO[t].use}`,
          }))}
        />
        <TextField
          label={info.label}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          maxLength={90}
          error={checked.ok ? undefined : input ? checked.error : undefined}
          hint={checked.ok ? (checked.note ?? info.hint) : info.hint}
        />

        {type === 'fnsku' ? (
          <SelectField
            label="Make"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'label', label: 'An Amazon FBA label (barcode, title and condition)' },
              { value: 'barcode', label: 'Just the barcode' },
            ]}
          />
        ) : null}

        {labelMode ? (
          <div className="flex flex-col gap-4">
            <TextField
              label="Product title"
              value={title}
              maxLength={200}
              placeholder="As it appears in Seller Central"
              hint="Long titles are shortened in the middle to fit, as Amazon suggests."
              onChange={(e) => setTitle(e.target.value)}
            />
            <SelectField
              label="Condition"
              value={condition}
              onChange={setCondition}
              options={LABEL_CONDITIONS.map((c) => ({ value: c, label: c }))}
            />
            <SelectField
              label="Label size"
              value={sizeId}
              onChange={setSizeId}
              options={AMAZON_LABEL_SIZES.map((s) => ({ value: s.id, label: s.name }))}
            />
            {thermal ? (
              <SelectField
                label="Printer resolution"
                value={String(dpi) as '203' | '300'}
                onChange={(v) => setDpi(Number(v) as 203 | 300)}
                options={[
                  { value: '203', label: '203 dpi (most Zebra, Rollo and DYMO printers)' },
                  { value: '300', label: '300 dpi' },
                ]}
                hint="Bars are drawn a whole number of printer dots wide, so every scanner reads them."
              />
            ) : null}
            <TextField
              label="Number of labels"
              type="number"
              inputMode="numeric"
              min={1}
              max={999}
              value={copies}
              onChange={(e) => setCopies(Math.max(1, Math.min(999, Number(e.target.value) || 1)))}
              hint={
                size.sheet
                  ? `${size.sheet.columns * size.sheet.rows} labels per sheet.`
                  : 'For the PDF and the Zebra file.'
              }
            />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Width (mm)"
                type="number"
                inputMode="decimal"
                min={5}
                max={500}
                step={0.1}
                value={built ? Number(built.widthMm.toFixed(2)) : ''}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  if (Number.isFinite(v) && v > 0) setWidthMm(Math.min(500, v))
                }}
                hint={
                  nominal && built
                    ? `${Math.round((built.widthMm / nominal) * 100)}% of standard size (${nominal} mm). Retail allows 80–200%.`
                    : built
                      ? `Including blank margins. Bars are ${built.moduleMm.toFixed(2)} mm at their narrowest.`
                      : undefined
                }
              />
              <TextField
                label="Bar height (mm)"
                type="number"
                inputMode="decimal"
                min={2}
                max={300}
                step={0.1}
                value={built ? Number(built.heightMm.toFixed(1)) : ''}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  if (Number.isFinite(v) && v > 0) setHeightMm(Math.min(300, v))
                }}
              />
            </div>
            <Checkbox
              label="Show the number under the bars"
              checked={showText}
              onChange={setShowText}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <ColorField label="Bars" value={fg} onChange={setFg} />
              <ColorField label="Background" value={bg} onChange={setBg} />
            </div>
            <Checkbox
              label="Transparent background (PNG, SVG, PDF)"
              checked={transparent}
              onChange={setTransparent}
            />
          </div>
        )}

        {type === 'upca' || type === 'ean13' || type === 'ean8' || type === 'upce' ? (
          <p className="body-small rounded-md bg-surface-sunk px-3 py-2 text-ink">
            We draw the barcode; the number itself must be yours. Shops and Amazon check retail
            numbers against the GS1 register, so get them from{' '}
            <a
              href="https://www.gs1.org/standards/get-barcodes"
              className="text-evergreen underline"
              rel="noopener"
            >
              GS1
            </a>{' '}
            and avoid resold “free UPC” numbers.
          </p>
        ) : null}
      </div>

      <aside aria-label="Your barcode" className="flex flex-col gap-4 lg:sticky lg:top-6">
        <div className="rounded-lg border border-hairline bg-surface p-4 shadow-card">
          <div
            className="flex min-h-40 items-center justify-center rounded-md bg-[repeating-conic-gradient(var(--surface-sunk)_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] p-4"
            // The SVG comes from our own renderer, which escapes every value.
            dangerouslySetInnerHTML={
              previewSvg
                ? {
                    __html: previewSvg.replace(
                      '<svg ',
                      '<svg role="img" aria-label="Barcode preview" style="max-width:100%;height:auto" ',
                    ),
                  }
                : undefined
            }
          >
            {previewSvg ? undefined : (
              <p className="body-small text-ink-muted">Enter a valid number to see the barcode.</p>
            )}
          </div>
          {previewScene ? (
            <div className="mt-3">
              <ScanResult summary={scan} live />
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-hairline bg-surface p-4 shadow-card">
          {labelMode && label ? (
            <>
              <Button
                variant="download"
                disabled={disabled}
                icon={<Download aria-hidden="true" size={18} strokeWidth={2} />}
                onClick={() =>
                  run(
                    'label PNG',
                    `fnsku-${label.fnsku}-${thermal ? `${dpi}dpi` : '300dpi'}.png`,
                    () => labelPng(label),
                  )
                }
              >
                {busy === 'label PNG' ? 'Preparing…' : 'Download label (PNG)'}
              </Button>
              <div className={`grid gap-2 ${thermal ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {vector ? (
                  <Button
                    disabled={disabled}
                    onClick={() =>
                      run('label PDF', `fnsku-${label.fnsku}-${copies}-labels.pdf`, () =>
                        labelPdf(label, copies),
                      )
                    }
                  >
                    {busy === 'label PDF'
                      ? 'PDF…'
                      : `PDF, ${copies} ${copies === 1 ? 'label' : 'labels'}`}
                  </Button>
                ) : (
                  <PaidButton label="PDF" onClick={showUpsell} />
                )}
                {thermal ? (
                  vector ? (
                    <Button
                      disabled={disabled}
                      onClick={() =>
                        run('ZPL', `fnsku-${label.fnsku}-${dpi}dpi.zpl`, () =>
                          labelZpl({ ...label, dpi }, copies),
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
              <p className="body-small text-ink-muted">
                {thermal
                  ? 'Print the PNG or PDF at 100% (actual size). Zebra printers can print the ZPL file directly.'
                  : 'Print the PDF at 100% (actual size, no scaling) on the label sheet.'}
              </p>
            </>
          ) : job ? (
            <>
              <SelectField
                label="PNG and JPG size"
                value={pngSize}
                onChange={setPngSize}
                options={[
                  {
                    value: 'print',
                    label: `Print: ${built!.widthMm.toFixed(1)} mm wide at 300 dpi or better`,
                  },
                  { value: 'screen', label: 'Small: for screens and documents' },
                  { value: 'large', label: 'Large: 8 px per bar' },
                ]}
                hint="Every bar is a whole number of pixels, so edges stay sharp."
              />
              <Button
                variant="download"
                disabled={disabled}
                icon={<Download aria-hidden="true" size={18} strokeWidth={2} />}
                onClick={() => run('PNG', `${base}.png`, () => barcodePng(job, ppm))}
              >
                {busy === 'PNG' ? 'Preparing PNG…' : 'Download PNG'}
              </Button>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Button
                  disabled={disabled}
                  onClick={() => run('JPG', `${base}.jpg`, () => barcodeJpg(job, ppm))}
                >
                  JPG
                </Button>
                {(
                  [
                    ['SVG', `${base}.svg`, () => barcodeSvg(job)],
                    ['PDF', `${base}.pdf`, () => barcodePdf(job)],
                    ['EPS', `${base}.eps`, () => barcodeEps(job)],
                  ] as const
                ).map(([fmtLabel, file, make]) =>
                  vector ? (
                    <Button
                      key={fmtLabel}
                      disabled={disabled}
                      onClick={() => run(fmtLabel, file, make)}
                    >
                      {busy === fmtLabel ? `${fmtLabel}…` : fmtLabel}
                    </Button>
                  ) : (
                    <PaidButton key={fmtLabel} label={fmtLabel} onClick={showUpsell} />
                  ),
                )}
              </div>
            </>
          ) : (
            <p className="body-small text-ink-muted">Fix the number above to download.</p>
          )}

          {upsell && !vector ? (
            <div
              role="status"
              className="flex flex-col gap-2 rounded-md border border-hairline bg-mint px-3 py-3"
            >
              <p className="body-small text-ink">
                <strong>SVG, PDF, EPS and Zebra files come with any paid plan</strong>, from $5 a
                month. Your first month is free.
              </p>
              <Link href="/pricing" className="body-small font-bold text-evergreen underline">
                {viewer?.signedIn ? 'Choose a plan' : 'See plans'}
              </Link>
            </div>
          ) : null}
          <p className="body-small text-ink-muted" aria-live="polite">
            {status ??
              (scan.state === 'fail'
                ? 'Fix the scan warning before you print.'
                : vector
                  ? 'No watermark, no sign-up. Made in your browser.'
                  : 'PNG and JPG are free, with no watermark and no sign-up. Formats with a crown come with a paid plan.')}
          </p>
        </div>
      </aside>
    </div>
  )
}
