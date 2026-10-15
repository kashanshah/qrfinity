import type { Logo } from '@qrfinity/core'

const MAX_BYTES = 10 * 1024 * 1024
const MAX_SIDE = 512
const TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif']

export class LogoError extends Error {}

/**
 * Reads a logo file in the browser and redraws it as a PNG of at most 512 px.
 * Nothing is uploaded; the result is a data URL kept in memory (or in a saved template).
 */
export async function processLogo(file: File): Promise<Logo> {
  if (!TYPES.includes(file.type)) throw new LogoError('Choose a PNG, JPG, WebP, GIF or SVG image.')
  if (file.size > MAX_BYTES) throw new LogoError('That image is over 10 MB. Choose a smaller file.')
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode().catch(() => {
      throw new LogoError('That image could not be opened. Try a PNG or JPG.')
    })
    const w0 = img.naturalWidth || MAX_SIDE
    const h0 = img.naturalHeight || MAX_SIDE
    const scale = Math.min(1, MAX_SIDE / Math.max(w0, h0))
    const width = Math.max(1, Math.round(w0 * scale))
    const height = Math.max(1, Math.round(h0 * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
    return { src: canvas.toDataURL('image/png'), width, height }
  } finally {
    URL.revokeObjectURL(url)
  }
}
