import { FRAME_FONT_FAMILY } from './font'
import { fmt } from './path'
import type { Paint, Scene } from './scene'

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

const SAFE_IMAGE = /^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=\s]+$/i

export type SvgOptions = {
  /** Pixel width written on the root element; the height follows the aspect ratio. */
  width?: number
}

/** Serialises a scene to a standalone SVG document. */
export function sceneToSvg(scene: Scene, options: SvgOptions = {}): string {
  const width = options.width ?? Math.round(scene.width * 10)
  const height = Math.round((width * scene.height) / scene.width)
  const defs: string[] = []
  const body: string[] = []

  const paintRef = (paint: Paint): string => {
    if (paint.type === 'solid') return escapeXml(paint.color)
    const id = `g${defs.length}`
    const stops = `<stop offset="0" stop-color="${escapeXml(paint.from)}"/><stop offset="1" stop-color="${escapeXml(paint.to)}"/>`
    if (paint.type === 'linear') {
      defs.push(
        `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${fmt(paint.x1)}" y1="${fmt(paint.y1)}" x2="${fmt(paint.x2)}" y2="${fmt(paint.y2)}">${stops}</linearGradient>`,
      )
    } else {
      defs.push(
        `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${fmt(paint.cx)}" cy="${fmt(paint.cy)}" r="${fmt(paint.r)}">${stops}</radialGradient>`,
      )
    }
    return `url(#${id})`
  }

  for (const item of scene.items) {
    if (item.kind === 'path') {
      const rule = item.evenOdd ? ' fill-rule="evenodd"' : ''
      body.push(`<path d="${item.d}" fill="${paintRef(item.fill)}"${rule}/>`)
    } else if (item.kind === 'image') {
      if (!SAFE_IMAGE.test(item.href)) continue
      body.push(
        `<image x="${fmt(item.x)}" y="${fmt(item.y)}" width="${fmt(item.width)}" height="${fmt(item.height)}" preserveAspectRatio="xMidYMid meet" href="${item.href}" xlink:href="${item.href}"/>`,
      )
    } else {
      body.push(
        `<text x="${fmt(item.x)}" y="${fmt(item.y)}" font-family="${escapeXml(FRAME_FONT_FAMILY)}" font-weight="700" font-size="${fmt(item.fontSize)}" text-anchor="middle" fill="${escapeXml(item.fill)}">${escapeXml(item.text)}</text>`,
      )
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" ` +
    `width="${width}" height="${height}" viewBox="0 0 ${fmt(scene.width)} ${fmt(scene.height)}">` +
    (defs.length ? `<defs>${defs.join('')}</defs>` : '') +
    body.join('') +
    `</svg>`
  )
}
