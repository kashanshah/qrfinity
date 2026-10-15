/** Draws an SVG string onto a canvas in the browser. */

export async function svgToCanvas(
  svg: string,
  width: number,
  height: number,
  matte?: string,
): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas is not available in this browser.')
    if (matte) {
      ctx.fillStyle = matte
      ctx.fillRect(0, 0, width, height)
    }
    ctx.drawImage(img, 0, 0, width, height)
    return canvas
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Could not create the image.'))),
      type,
      quality,
    ),
  )
}

/** Loads an image URL (e.g. the logo data URL) and returns its pixels, fitted within `max` px. */
export async function imagePixels(src: string, max: number) {
  const img = new Image()
  img.src = src
  await img.decode()
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
  const width = Math.max(1, Math.round(img.naturalWidth * scale))
  const height = Math.max(1, Math.round(img.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, width, height)
  return { width, height, data: ctx.getImageData(0, 0, width, height).data }
}
