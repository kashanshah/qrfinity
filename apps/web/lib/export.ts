'use client'

import { isVectorLogo, sceneToEps, sceneToSvg, type Design, type Scene } from '@qrfinity/core'
import { canvasToBlob, imagePixels, svgToCanvas } from './raster'

export const PRINT_DPI = 300
/** Largest raster we draw; beyond this, vector formats are the better choice. */
export const MAX_RASTER_PX = 6000

export type ExportFormat = 'png' | 'jpg' | 'svg' | 'pdf' | 'eps'

export type ExportJob = {
  scene: Scene
  design: Design
  printWidthMm: number
  baseName: string
}

export function printPixels(printWidthMm: number): number {
  return Math.min(MAX_RASTER_PX, Math.round((printWidthMm / 25.4) * PRINT_DPI))
}

const heightFor = (scene: Scene, width: number) => Math.round((width * scene.height) / scene.width)

// ---- PNG with a 300 dpi pHYs chunk, so print software sizes it correctly.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

async function withDpi(png: Blob, dpi: number): Promise<Blob> {
  const bytes = new Uint8Array(await png.arrayBuffer())
  const ppm = Math.round(dpi / 0.0254)
  const chunk = new Uint8Array(21)
  const view = new DataView(chunk.buffer)
  view.setUint32(0, 9)
  chunk.set([0x70, 0x48, 0x59, 0x73], 4) // "pHYs"
  view.setUint32(8, ppm)
  view.setUint32(12, ppm)
  chunk[16] = 1 // unit: metre
  view.setUint32(17, crc32(chunk.subarray(4, 17)))
  const ihdrEnd = 8 + 25 // signature + IHDR chunk
  const out = new Uint8Array(bytes.length + chunk.length)
  out.set(bytes.subarray(0, ihdrEnd), 0)
  out.set(chunk, ihdrEnd)
  out.set(bytes.subarray(ihdrEnd), ihdrEnd + chunk.length)
  return new Blob([out], { type: 'image/png' })
}

export async function exportPng(job: ExportJob, width: number): Promise<Blob> {
  const svg = sceneToSvg(job.scene, { width })
  const canvas = await svgToCanvas(svg, width, heightFor(job.scene, width))
  return withDpi(await canvasToBlob(canvas, 'image/png'), PRINT_DPI)
}

export async function exportJpg(job: ExportJob, width: number): Promise<Blob> {
  const svg = sceneToSvg(job.scene, { width })
  // JPG has no transparency: use the background colour, or white.
  const matte = job.design.transparentBackground ? '#ffffff' : job.design.background
  const canvas = await svgToCanvas(svg, width, heightFor(job.scene, width), matte)
  return canvasToBlob(canvas, 'image/jpeg', 0.92)
}

export function exportSvg(job: ExportJob, width = 1024): Blob {
  return new Blob([sceneToSvg(job.scene, { width })], { type: 'image/svg+xml' })
}

export async function exportPdf(job: ExportJob): Promise<Blob> {
  const [{ jsPDF }] = await Promise.all([import('jspdf'), import('svg2pdf.js')])
  const w = job.printWidthMm
  const h = (w * job.scene.height) / job.scene.width
  const doc = new jsPDF({
    unit: 'mm',
    format: [w, h],
    orientation: w > h ? 'landscape' : 'portrait',
    compress: true,
  })
  doc.setProperties({ title: job.baseName, creator: 'QRfinity (qrfinity.com)' })
  const svg = sceneToSvg(job.scene, { width: 1000 })
  const el = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement
  await doc.svg(el, { x: 0, y: 0, width: w, height: h })
  return doc.output('blob')
}

export async function exportEps(job: ExportJob): Promise<Blob> {
  // Vector logos are paths in the scene; only an uploaded image needs its pixels.
  const logo = job.design.logo
  const logoPixels = logo && !isVectorLogo(logo) ? await imagePixels(logo.src, 384) : undefined
  const eps = sceneToEps(job.scene, {
    widthPt: (job.printWidthMm / 25.4) * 72,
    logoPixels,
    matte: job.design.transparentBackground ? '#ffffff' : job.design.background,
    title: job.baseName,
  })
  return new Blob([eps], { type: 'application/postscript' })
}

/** Every format, PNGs in several sizes, zipped. */
export async function exportZip(job: ExportJob): Promise<Blob> {
  const { zipSync } = await import('fflate')
  const bytes = async (b: Blob | Promise<Blob>) => new Uint8Array(await (await b).arrayBuffer())
  const n = job.baseName
  const files: Record<string, Uint8Array> = {}
  for (const size of [512, 1024, 2048])
    files[`${n}-${size}px.png`] = await bytes(exportPng(job, size))
  const print = printPixels(job.printWidthMm)
  files[`${n}-print-${job.printWidthMm}mm-300dpi.png`] = await bytes(exportPng(job, print))
  files[`${n}-1024px.jpg`] = await bytes(exportJpg(job, 1024))
  files[`${n}.svg`] = await bytes(exportSvg(job))
  files[`${n}.pdf`] = await bytes(exportPdf(job))
  files[`${n}.eps`] = await bytes(exportEps(job))
  // PNG, JPG and PDF are already compressed.
  return new Blob([zipSync(files, { level: 6 })], { type: 'application/zip' })
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
