'use client'

import { useEffect, useRef, useState } from 'react'
import { svgToCanvas } from './raster'

/** What the decoder found, for the QR code tester. */
export type DecodeInfo = {
  ecLevel: string
  version: string
  inverted: boolean
  position: Record<'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft', { x: number; y: number }>
}
type Reply = { id: number; text: string | null; info?: DecodeInfo }
type Pending = (reply: Reply) => void
let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, Pending>()

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./scan.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<Reply>) => {
      pending.get(e.data.id)?.(e.data)
      pending.delete(e.data.id)
    }
  }
  return worker
}

function post(
  image: ImageData,
  photo: boolean,
  detail: boolean,
  formats?: string[],
): Promise<Reply> {
  const id = nextId++
  return new Promise((resolve) => {
    pending.set(id, resolve)
    getWorker().postMessage({ id, image, photo, detail, formats }, [image.data.buffer])
  })
}

/** Reads a barcode from rendered pixels: linear by default, or the given zxing formats (the image is transferred). */
export async function decodeBarcodeImage(
  image: ImageData,
  formats: string[] = ['AllLinear'],
): Promise<string | null> {
  return (await post(image, false, false, formats)).text
}

async function decode(image: ImageData, photo = false): Promise<string | null> {
  return (await post(image, photo, false)).text
}

/** Decodes and says where the code is and how it was made (the image is transferred: pass a copy). */
export async function decodeDetailed(
  image: ImageData,
  photo = true,
): Promise<{ text: string; info: DecodeInfo } | null> {
  const r = await post(image, photo, true)
  return r.text !== null && r.info ? { text: r.text, info: r.info } : null
}

/** Decodes without details (the image is transferred: pass a copy). */
export const decodeImageData = (image: ImageData, photo = false) => decode(image, photo)

export function pixels(source: CanvasImageSource, width: number, height: number, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(width, height))
  const w = Math.max(1, Math.round(width * scale))
  const h = Math.max(1, Math.round(height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#ffffff' // transparent PNGs decode against white, like paper
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(source, 0, 0, w, h)
  return ctx.getImageData(0, 0, w, h)
}

/**
 * Reads a QR code from a photo, screenshot or saved image, entirely in the browser. Big photos
 * are tried scaled down first (faster, and often more reliable), then at up to 3000 px.
 */
export async function decodeImageFile(file: Blob): Promise<string | null> {
  const bitmap = await createImageBitmap(file)
  try {
    const { width, height } = bitmap
    const first = await decode(pixels(bitmap, width, height, 1600), true)
    if (first !== null || Math.max(width, height) <= 1600) return first
    return await decode(pixels(bitmap, width, height, 3000), true)
  } finally {
    bitmap.close()
  }
}

/** Reads a QR code from one camera frame. */
export function decodeVideoFrame(video: HTMLVideoElement): Promise<string | null> {
  return decode(pixels(video, video.videoWidth, video.videoHeight, 1280), true)
}

export type ScanState = { status: 'checking' } | { status: 'done'; decoded: string | null }

/**
 * Re-checks the rendered code 300 ms after the last change: rasterises the SVG at a
 * modest resolution (about 5 px per module) and decodes it in a worker.
 */
export function useScanCheck(svg: string | null, aspect: number, modules: number): ScanState {
  // The result is stored with the SVG it belongs to; any other SVG is still being checked.
  const [result, setResult] = useState<{ svg: string; decoded: string | null } | null>(null)
  const latest = useRef(0)

  useEffect(() => {
    if (!svg) return
    const run = ++latest.current
    const timer = setTimeout(async () => {
      try {
        const width = Math.round(Math.min(1000, Math.max(360, modules * 5)))
        const height = Math.round(width * aspect)
        const canvas = await svgToCanvas(svg, width, height, '#ffffff')
        const image = canvas.getContext('2d')!.getImageData(0, 0, width, height)
        const decoded = await decode(image)
        if (run === latest.current) setResult({ svg, decoded })
      } catch {
        if (run === latest.current) setResult({ svg, decoded: null })
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [svg, aspect, modules])

  return result && result.svg === svg
    ? { status: 'done', decoded: result.decoded }
    : { status: 'checking' }
}
