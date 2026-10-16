'use client'

import {
  measureContrast,
  measureQuietZone,
  testReport,
  type Quad,
  type TestMeasurements,
  type TestReport,
} from '@qrfinity/core'
import { decodeDetailed, decodeImageData, pixels } from './scan'

export type QrTestResult = {
  text: string
  measurements: TestMeasurements
  report: TestReport
}

const copy = (img: ImageData) =>
  new ImageData(new Uint8ClampedArray(img.data), img.width, img.height)

function side(q: Quad) {
  const d = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y)
  return (d(q.topLeft, q.topRight) + d(q.topLeft, q.bottomLeft)) / 2
}

/** The image redrawn with each module `target` px wide (shrunk only, never enlarged). */
function shrunk(bitmap: ImageBitmap, base: ImageData, scale: number) {
  return pixels(bitmap, Math.round(base.width * scale), Math.round(base.height * scale), 1e6)
}

function blurred(bitmap: ImageBitmap, base: ImageData, radius: number) {
  const canvas = document.createElement('canvas')
  canvas.width = base.width
  canvas.height = base.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, base.width, base.height)
  ctx.filter = `blur(${radius}px)`
  ctx.drawImage(bitmap, 0, 0, base.width, base.height)
  return ctx.getImageData(0, 0, base.width, base.height)
}

/**
 * Tests a QR code design: decodes it, measures contrast and margin, and checks it still reads
 * when shrunk and when blurred, all in the browser. Null when there's no QR code in the image.
 */
export async function testQrImage(file: Blob): Promise<QrTestResult | null> {
  const bitmap = await createImageBitmap(file)
  try {
    const base = pixels(bitmap, bitmap.width, bitmap.height, 1600)
    const found = await decodeDetailed(copy(base), true)
    if (!found) return null
    const quad = found.info.position as Quad
    const version = parseInt(found.info.version, 10) || 1
    const modules = 17 + 4 * version
    const inverted = found.info.inverted
    const raster = { width: base.width, height: base.height, data: base.data }
    const contrast = measureContrast(raster, quad)
    const quietZone = measureQuietZone(raster, quad, modules, contrast.threshold, inverted)
    const modulePx = side(quad) / modules

    // Shrink until it stops reading: 3, 2, then 1.5 px per module.
    let smallestModulePx: number | null = null
    for (const target of [3, 2, 1.5]) {
      if (modulePx <= target) {
        smallestModulePx = Math.round(modulePx * 10) / 10
        continue
      }
      const ok = (await decodeImageData(shrunk(bitmap, base, target / modulePx), inverted)) !== null
      if (!ok) break
      smallestModulePx = target
    }
    const survivesBlur =
      (await decodeImageData(blurred(bitmap, base, Math.max(0.6, modulePx * 0.35)), inverted)) !==
      null

    const ec = found.info.ecLevel.toUpperCase()
    const measurements: TestMeasurements = {
      modules,
      version,
      ecLevel: ec === 'L' || ec === 'M' || ec === 'Q' || ec === 'H' ? ec : null,
      inverted,
      contrast: contrast.ratio,
      quietZone,
      smallestModulePx,
      survivesBlur,
    }
    return { text: found.text, measurements, report: testReport(measurements) }
  } finally {
    bitmap.close()
  }
}
