'use client'

/**
 * Downloads for barcodes and Amazon labels. Rasters keep every bar a whole number of pixels, so
 * edges stay sharp and scanners read the widths exactly; vectors are sized in millimetres.
 */
import {
  fnskuLabelScene,
  fnskuLabelZpl,
  sceneToEps,
  sceneToSvg,
  type FnskuLabel,
  type Scene,
} from '@qrfinity/core'
import { withDpi } from './export'
import { canvasToBlob, svgToCanvas } from './raster'

export type BarcodeJob = {
  scene: Scene
  /** Printed width, quiet zones included. */
  widthMm: number
  matte: string
  baseName: string
}

const mmPerUnit = (job: BarcodeJob) => job.widthMm / job.scene.width

/** Pixels per module for a target dpi at the printed size (at least 1). */
export function pixelsPerModule(job: BarcodeJob, dpi: number): number {
  return Math.max(1, Math.round((mmPerUnit(job) / 25.4) * dpi))
}

async function raster(job: BarcodeJob, ppm: number, type: 'png' | 'jpg') {
  const width = Math.round(job.scene.width * ppm)
  const height = Math.round(job.scene.height * ppm)
  const svg = sceneToSvg(job.scene, { width })
  const canvas = await svgToCanvas(svg, width, height, type === 'jpg' ? job.matte : undefined)
  if (type === 'jpg') return canvasToBlob(canvas, 'image/jpeg', 0.95)
  // The dpi that makes this image print at exactly the chosen width.
  const dpi = (width / job.widthMm) * 25.4
  return withDpi(await canvasToBlob(canvas, 'image/png'), dpi)
}

export const barcodePng = (job: BarcodeJob, ppm: number) => raster(job, ppm, 'png')
export const barcodeJpg = (job: BarcodeJob, ppm: number) => raster(job, ppm, 'jpg')

/** SVG sized in millimetres, so design software places it at the right size. */
export function barcodeSvgText(scene: Scene, widthMm: number): string {
  const heightMm = (widthMm * scene.height) / scene.width
  return sceneToSvg(scene, { width: 1000 }).replace(
    /width="\d+" height="\d+"/,
    `width="${widthMm.toFixed(2)}mm" height="${heightMm.toFixed(2)}mm"`,
  )
}

export const barcodeSvg = (job: BarcodeJob) =>
  new Blob([barcodeSvgText(job.scene, job.widthMm)], { type: 'image/svg+xml' })

export function barcodeEps(job: BarcodeJob): Blob {
  const eps = sceneToEps(job.scene, {
    widthPt: (job.widthMm / 25.4) * 72,
    matte: job.matte,
    title: job.baseName,
  })
  return new Blob([eps], { type: 'application/postscript' })
}

type Placed = { scene: Scene; x: number; y: number; w: number; h: number }

/** A PDF with one page per entry in `pages`, each holding scenes at given millimetre positions. */
async function pdfPages(
  pages: { widthMm: number; heightMm: number; items: Placed[] }[],
  title: string,
): Promise<Blob> {
  const [{ jsPDF }] = await Promise.all([import('jspdf'), import('svg2pdf.js')])
  const first = pages[0]!
  const doc = new jsPDF({
    unit: 'mm',
    format: [first.widthMm, first.heightMm],
    orientation: first.widthMm > first.heightMm ? 'landscape' : 'portrait',
    compress: true,
  })
  doc.setProperties({ title, creator: 'QRfinity (qrfinity.com)' })
  for (const [i, page] of pages.entries()) {
    if (i > 0)
      doc.addPage(
        [page.widthMm, page.heightMm],
        page.widthMm > page.heightMm ? 'landscape' : 'portrait',
      )
    for (const item of page.items) {
      const svg = sceneToSvg(item.scene, { width: 1000 })
      const el = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement
      await doc.svg(el, { x: item.x, y: item.y, width: item.w, height: item.h })
    }
  }
  return doc.output('blob')
}

export function barcodePdf(job: BarcodeJob): Promise<Blob> {
  const h = (job.widthMm * job.scene.height) / job.scene.width
  return pdfPages(
    [
      {
        widthMm: job.widthMm,
        heightMm: h,
        items: [{ scene: job.scene, x: 0, y: 0, w: job.widthMm, h }],
      },
    ],
    job.baseName,
  )
}

// ---------------------------------------------------------------------------
// Amazon FNSKU labels

/** One label as a PNG at the printer's resolution (thermal) or 300 dpi (sheets). */
export async function labelPng(label: FnskuLabel): Promise<Blob> {
  const dpi = label.dpi ?? 300
  const { scene } = fnskuLabelScene(label)
  const width = Math.round((scene.width / 25.4) * dpi)
  const height = Math.round((scene.height / 25.4) * dpi)
  const canvas = await svgToCanvas(sceneToSvg(scene, { width }), width, height, '#ffffff')
  return withDpi(await canvasToBlob(canvas, 'image/png'), dpi)
}

/**
 * Labels as a PDF: thermal sizes get one label per page (the printer feeds one label at a time);
 * sheet sizes are laid out on Letter or A4, filling as many sheets as needed. All labels share a size.
 */
export function labelsPdf(labels: FnskuLabel[], title: string): Promise<Blob> {
  const size = labels[0]!.size
  const sheet = size.sheet
  const scenes = labels.map((l) => fnskuLabelScene(l).scene)
  if (!sheet) {
    return pdfPages(
      scenes.map((scene) => ({
        widthMm: size.widthMm,
        heightMm: size.heightMm,
        items: [{ scene, x: 0, y: 0, w: size.widthMm, h: size.heightMm }],
      })),
      title,
    )
  }
  const perSheet = sheet.columns * sheet.rows
  const pages: { widthMm: number; heightMm: number; items: Placed[] }[] = []
  scenes.forEach((scene, i) => {
    if (i % perSheet === 0)
      pages.push({ widthMm: sheet.pageWidthMm, heightMm: sheet.pageHeightMm, items: [] })
    const slot = i % perSheet
    pages.at(-1)!.items.push({
      scene,
      x: sheet.marginLeftMm + (slot % sheet.columns) * sheet.pitchXMm,
      y: sheet.marginTopMm + Math.floor(slot / sheet.columns) * sheet.pitchYMm,
      w: size.widthMm,
      h: size.heightMm,
    })
  })
  return pdfPages(pages, title)
}

/** Copies of one label. */
export function labelPdf(label: FnskuLabel, copies: number): Promise<Blob> {
  const n = Math.max(1, Math.min(999, Math.floor(copies)))
  return labelsPdf(
    Array.from({ length: n }, () => label),
    `FNSKU ${label.fnsku}`,
  )
}

export function labelZpl(label: FnskuLabel & { dpi: 203 | 300 }, copies: number): Blob {
  return new Blob([fnskuLabelZpl(label, copies)], { type: 'text/plain' })
}

/** Several Zebra labels in one file, one per label. */
export function labelsZpl(labels: (FnskuLabel & { dpi: 203 | 300 })[]): Blob {
  return new Blob([labels.map((l) => fnskuLabelZpl(l, 1)).join('')], { type: 'text/plain' })
}

// ---------------------------------------------------------------------------
// Bulk barcodes

/** Every item as a file in one ZIP. `make` builds each file; `onProgress` reports how many are done. */
export async function zipFiles(
  items: { name: string; make: () => Promise<Blob> | Blob }[],
  onProgress?: (done: number) => void,
): Promise<Blob> {
  const { zipSync } = await import('fflate')
  const files: Record<string, Uint8Array> = {}
  for (const [i, item] of items.entries()) {
    files[item.name] = new Uint8Array(await (await item.make()).arrayBuffer())
    onProgress?.(i + 1)
  }
  // PNGs are already compressed: store them.
  return new Blob([zipSync(files, { level: 0 })], { type: 'application/zip' })
}

export const PAGE_SIZES = {
  letter: { name: 'US Letter', widthMm: 215.9, heightMm: 279.4 },
  a4: { name: 'A4', widthMm: 210, heightMm: 297 },
} as const

/** Barcodes at their print size, flowed onto pages in rows with 6 mm between them. */
export function barcodesPdf(
  jobs: BarcodeJob[],
  page: keyof typeof PAGE_SIZES,
  title: string,
): Promise<Blob> {
  const { widthMm: pw, heightMm: ph } = PAGE_SIZES[page]
  const margin = 12
  const gap = 6
  const pages: { widthMm: number; heightMm: number; items: Placed[] }[] = [
    { widthMm: pw, heightMm: ph, items: [] },
  ]
  let x = margin
  let y = margin
  let rowH = 0
  for (const job of jobs) {
    const w = Math.min(job.widthMm, pw - margin * 2)
    const h = (w * job.scene.height) / job.scene.width
    if (x + w > pw - margin) {
      x = margin
      y += rowH + gap
      rowH = 0
    }
    if (y + h > ph - margin) {
      pages.push({ widthMm: pw, heightMm: ph, items: [] })
      x = margin
      y = margin
      rowH = 0
    }
    pages.at(-1)!.items.push({ scene: job.scene, x, y, w, h })
    x += w + gap
    rowH = Math.max(rowH, h)
  }
  return pdfPages(pages, title)
}
