/**
 * Writes a scene as Encapsulated PostScript (Level 3, for gradients). Shapes stay vector;
 * a logo is embedded as an RGB image composited onto the background colour, since EPS
 * has no simple alpha channel.
 */
import { parseHex } from '../color'
import { FRAME_FONT_POSTSCRIPT } from './font'
import { fmt } from './path'
import type { Paint, Scene } from './scene'

export type RasterImage = { width: number; height: number; data: Uint8ClampedArray }

export type EpsOptions = {
  /** Output width in PostScript points (1/72 in). */
  widthPt: number
  /** Decoded logo pixels (RGBA). Without them the logo is left out. */
  logoPixels?: RasterImage
  /** Colour under transparent logo pixels. */
  matte?: string
  title?: string
}

function rgb(hex: string): string {
  const { r, g, b } = parseHex(hex)
  return `${fmt(r / 255)} ${fmt(g / 255)} ${fmt(b / 255)}`
}

/** SVG path data (M/L/C/Z only) → PostScript using the m/l/c/z shorthands defined below. */
export function pathToPostScript(d: string): string {
  const out: string[] = []
  const re = /([MLCZ])([^MLCZ]*)/g
  let match: RegExpExecArray | null
  let line = ''
  while ((match = re.exec(d))) {
    const nums = match[2]!.trim()
    const op = match[1]!.toLowerCase()
    const token = nums ? `${nums} ${op}` : op
    if (line.length + token.length > 240) {
      out.push(line)
      line = ''
    }
    line += (line ? ' ' : '') + token
  }
  if (line) out.push(line)
  return out.join('\n')
}

/** Encodes text for a PostScript string literal, in ISO Latin-1. */
export function psString(text: string): string {
  let s = ''
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 63
    if (ch === '(' || ch === ')' || ch === '\\') s += '\\' + ch
    else if (code >= 32 && code <= 126) s += ch
    else if (code >= 160 && code <= 255) s += '\\' + code.toString(8).padStart(3, '0')
    else s += '?'
  }
  return `(${s})`
}

function shading(paint: Exclude<Paint, { type: 'solid' }>): string {
  const fn = `<< /FunctionType 2 /Domain [0 1] /C0 [${rgb(paint.from)}] /C1 [${rgb(paint.to)}] /N 1 >>`
  if (paint.type === 'linear') {
    return `<< /ShadingType 2 /ColorSpace /DeviceRGB /Coords [${fmt(paint.x1)} ${fmt(paint.y1)} ${fmt(paint.x2)} ${fmt(paint.y2)}] /Function ${fn} /Extend [true true] >> shfill`
  }
  return `<< /ShadingType 3 /ColorSpace /DeviceRGB /Coords [${fmt(paint.cx)} ${fmt(paint.cy)} 0 ${fmt(paint.cx)} ${fmt(paint.cy)} ${fmt(paint.r)}] /Function ${fn} /Extend [true true] >> shfill`
}

function imageHex(img: RasterImage, matte: string): string {
  const { r: mr, g: mg, b: mb } = parseHex(matte)
  const lines: string[] = []
  let line = ''
  const hex = (n: number) => n.toString(16).padStart(2, '0')
  for (let i = 0; i < img.width * img.height; i++) {
    const a = img.data[i * 4 + 3]! / 255
    const r = Math.round(img.data[i * 4]! * a + mr * (1 - a))
    const g = Math.round(img.data[i * 4 + 1]! * a + mg * (1 - a))
    const b = Math.round(img.data[i * 4 + 2]! * a + mb * (1 - a))
    line += hex(r) + hex(g) + hex(b)
    if (line.length >= 240) {
      lines.push(line)
      line = ''
    }
  }
  if (line) lines.push(line)
  return lines.join('\n') + '>'
}

export function sceneToEps(scene: Scene, options: EpsOptions): string {
  const s = options.widthPt / scene.width
  const wPt = options.widthPt
  const hPt = scene.height * s
  const out: string[] = [
    '%!PS-Adobe-3.0 EPSF-3.0',
    `%%BoundingBox: 0 0 ${Math.ceil(wPt)} ${Math.ceil(hPt)}`,
    `%%HiResBoundingBox: 0 0 ${fmt(wPt)} ${fmt(hPt)}`,
    `%%Title: ${(options.title ?? 'QR code').replace(/[^\x20-\x7e]/g, '')}`,
    '%%Creator: QRfinity (qrfinity.com)',
    '%%LanguageLevel: 3',
    '%%Pages: 1',
    '%%EndComments',
    '%%BeginProlog',
    '/m {moveto} bind def /l {lineto} bind def /c {curveto} bind def /z {closepath} bind def',
    '%%EndProlog',
    '%%Page: 1 1',
    'save',
    // Flip to a y-down coordinate system in scene units, matching SVG.
    `0 ${fmt(hPt)} translate ${fmt(s)} ${fmt(-s)} scale`,
  ]

  let fontReady = false
  for (const item of scene.items) {
    if (item.kind === 'path') {
      out.push('newpath', pathToPostScript(item.d))
      if (item.fill.type === 'solid') {
        out.push(`${rgb(item.fill.color)} setrgbcolor ${item.evenOdd ? 'eofill' : 'fill'}`)
      } else {
        out.push(`gsave ${item.evenOdd ? 'eoclip' : 'clip'} newpath ${shading(item.fill)} grestore`)
      }
    } else if (item.kind === 'image') {
      const img = options.logoPixels
      if (!img) continue
      out.push(
        'gsave',
        `${fmt(item.x)} ${fmt(item.y)} translate ${fmt(item.width)} ${fmt(item.height)} scale`,
        '/DeviceRGB setcolorspace',
        `<< /ImageType 1 /Width ${img.width} /Height ${img.height} /BitsPerComponent 8 /Decode [0 1 0 1 0 1] /ImageMatrix [${img.width} 0 0 ${img.height} 0 0] /DataSource currentfile /ASCIIHexDecode filter >> image`,
        imageHex(img, options.matte ?? '#ffffff'),
        'grestore',
      )
    } else {
      if (!fontReady) {
        out.push(
          `/${FRAME_FONT_POSTSCRIPT} findfont dup length dict begin {1 index /FID ne {def} {pop pop} ifelse} forall /Encoding ISOLatin1Encoding def currentdict end /QRfinityLabelFont exch definefont pop`,
        )
        fontReady = true
      }
      out.push(
        `gsave ${fmt(item.x)} ${fmt(item.y)} translate 1 -1 scale ${rgb(item.fill)} setrgbcolor`,
        `/QRfinityLabelFont findfont ${fmt(item.fontSize)} scalefont setfont`,
        `${psString(item.text)} dup stringwidth pop 2 div neg 0 moveto show grestore`,
      )
    }
  }

  out.push('restore', 'showpage', '%%EOF')
  return out.join('\n') + '\n'
}
