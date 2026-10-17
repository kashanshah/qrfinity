/**
 * Barcodes as scenes (see qr/scene.ts): the same SVG, EPS, PDF and PNG writers draw them, so
 * every format matches. A barcode scene is in module units; an Amazon label is in millimetres.
 */
import { CAP_HEIGHT, textWidth } from '../qr/font'
import { fmt } from '../qr/path'
import type { Scene, SceneItem } from '../qr/scene'
import { encodeBarcode, type BarcodeType, type Encoded } from './encode'

export type BarcodeStyle = {
  /** Height of the bars, in modules. */
  barHeight: number
  /** Print the digits or text under the bars. */
  showText: boolean
  foreground: string
  background: string
  transparent: boolean
}

/** Sensible defaults per type, in modules (a retail EAN at 100% is 0.33 mm per module). */
export const DEFAULT_BAR_HEIGHT: Record<BarcodeType, number> = {
  ean13: 69,
  isbn: 69,
  upca: 69,
  ean8: 55,
  upce: 69,
  itf14: 60,
  code39: 50,
  code128: 50,
  fnsku: 50,
  gs1128: 50,
}

/** Default bar height in mm: the standard height at 100% for retail and ITF-14, a practical one for labels. */
export const DEFAULT_HEIGHT_MM: Record<BarcodeType, number> = {
  ean13: 22.85,
  isbn: 22.85,
  upca: 22.85,
  ean8: 18.23,
  upce: 22.85,
  itf14: 32,
  code39: 15,
  code128: 15,
  fnsku: 12,
  gs1128: 25,
}

/** Nominal print width (mm, quiet zones included) at 100% magnification, where a standard exists. */
export const NOMINAL_WIDTH_MM: Partial<Record<BarcodeType, number>> = {
  ean13: 37.29,
  isbn: 37.29,
  upca: 37.29,
  ean8: 26.73,
  upce: 22.11,
  itf14: 152.4,
}

const RETAIL: BarcodeType[] = ['ean13', 'isbn', 'upca', 'ean8', 'upce']
const PAD = 4

const rect = (x: number, y: number, w: number, h: number) =>
  `M${fmt(x)} ${fmt(y)}H${fmt(x + w)}V${fmt(y + h)}H${fmt(x)}Z`

/** Rectangles for each run of bars, starting at (x, y). `tall(i)` says whether a run is a guard. */
function barsPath(
  modules: string,
  x: number,
  y: number,
  height: number,
  guardHeight: number,
  isGuard: (i: number) => boolean,
  unit = 1,
): string {
  let d = ''
  let i = 0
  while (i < modules.length) {
    if (modules[i] !== '1') {
      i++
      continue
    }
    let j = i
    while (j < modules.length && modules[j] === '1') j++
    d += rect(x + i * unit, y, (j - i) * unit, isGuard(i) ? guardHeight : height)
    i = j
  }
  return d
}

/** Builds the scene for an encoded barcode. Width = quiet zones + modules; units = modules. */
export function barcodeScene(type: BarcodeType, enc: Encoded, style: BarcodeStyle): Scene {
  const retail = RETAIL.includes(type)
  const addonW = enc.addon ? enc.addon.gap + enc.addon.modules.length : 0
  const symbolW = enc.modules.length + addonW
  const left = Math.max(enc.quiet.left, ...enc.text.map((t) => 1 - t.from))
  const right = Math.max(enc.quiet.right, ...enc.text.map((t) => t.to + 1 - symbolW))
  const width = left + symbolW + right

  // Text size: retail digits are about 9 modules tall; other text fits the symbol width.
  const runText = enc.text.map((t) => t.text).join(' ')
  let fontSize = retail ? 9 : 10
  if (!retail) {
    const w = textWidth(runText, 1)
    if (w > 0) fontSize = Math.max(5, Math.min(10, (enc.modules.length * 0.95) / w))
  }
  const showText = style.showText && enc.text.length > 0
  const aboveSize = 8
  const aboveH = style.showText && enc.above ? aboveSize + 3 : 0
  const bearer = enc.bearer ? 3 : 0

  const top = PAD + aboveH + bearer
  const barH = style.barHeight
  // Retail digits tuck under the bars, with the guards running down beside them.
  const textGap = retail ? 1 : 2
  const textH = showText ? textGap + fontSize * CAP_HEIGHT + (retail ? 0 : 1) : 0
  const guardH = barH + (showText && retail ? fontSize * 0.55 : 0)
  const height = top + barH + Math.max(textH, guardH - barH) + bearer + PAD

  const fg = style.foreground
  const items: SceneItem[] = []
  if (!style.transparent)
    items.push({
      kind: 'path',
      d: rect(0, 0, width, height),
      fill: { type: 'solid', color: style.background },
    })

  const isGuard = (i: number) => enc.guards.some(([a, b]) => i >= a && i < b)
  items.push({
    kind: 'path',
    d: barsPath(enc.modules, left, top, barH, guardH, isGuard),
    fill: { type: 'solid', color: fg },
  })

  if (enc.addon) {
    // Add-on digits sit above its bars; the bars end level with the guard bars.
    const x0 = left + enc.modules.length + enc.addon.gap
    const textTop = style.showText ? fontSize * CAP_HEIGHT + 1.5 : 0
    items.push({
      kind: 'path',
      d: barsPath(
        enc.addon.modules,
        x0,
        top + textTop,
        guardH - textTop,
        guardH - textTop,
        () => false,
      ),
      fill: { type: 'solid', color: fg },
    })
    if (style.showText)
      items.push({
        kind: 'text',
        text: enc.addon.text,
        x: x0 + enc.addon.modules.length / 2,
        y: top + fontSize * CAP_HEIGHT,
        fontSize,
        fill: fg,
      })
  }

  if (bearer) {
    // ITF-14 bearer bars across the whole symbol, quiet zones included, so a skewed scan can't misread it.
    const x0 = left - enc.quiet.left
    const w = enc.quiet.left + enc.modules.length + enc.quiet.right
    items.push({
      kind: 'path',
      d: rect(x0, top - bearer, w, bearer) + rect(x0, top + barH + textH, w, bearer),
      fill: { type: 'solid', color: fg },
    })
  }

  if (showText) {
    const baseline = top + barH + textGap + fontSize * CAP_HEIGHT
    for (const t of enc.text) {
      const size = t.small ? fontSize * 0.75 : fontSize
      items.push({
        kind: 'text',
        text: t.text,
        x: left + (t.from + t.to) / 2,
        y: baseline,
        fontSize: size,
        fill: fg,
      })
    }
  }
  if (aboveH && enc.above) {
    const size = Math.min(
      aboveSize,
      (enc.modules.length * 0.95) / Math.max(1, textWidth(enc.above, 1)),
    )
    items.push({
      kind: 'text',
      text: enc.above,
      x: left + enc.modules.length / 2,
      y: PAD + aboveSize * CAP_HEIGHT,
      fontSize: size,
      fill: fg,
    })
  }
  return { width, height, items }
}

/** Encode and draw in one step. */
export function renderBarcode(
  type: BarcodeType,
  value: string,
  style: BarcodeStyle,
  above?: string,
  addon?: string,
): { scene: Scene; encoded: Encoded } {
  const encoded = encodeBarcode(type, value, above, addon)
  return { scene: barcodeScene(type, encoded, style), encoded }
}

// ---------------------------------------------------------------------------
// Amazon FBA labels

export type LabelSize = {
  id: string
  name: string
  widthMm: number
  heightMm: number
  /** Thermal roll labels (one label per page) or a sheet layout for office printers. */
  sheet?: SheetLayout
}

export type SheetLayout = {
  pageWidthMm: number
  pageHeightMm: number
  columns: number
  rows: number
  marginLeftMm: number
  marginTopMm: number
  pitchXMm: number
  pitchYMm: number
}

const IN = 25.4

/** Label sizes Amazon accepts (from 1 × 2 in to 2 × 3 in), for thermal printers and label sheets. */
export const AMAZON_LABEL_SIZES: LabelSize[] = [
  {
    id: 'thermal-2.25x1.25',
    name: '2.25 × 1.25 in thermal (Zebra, Rollo, DYMO 30334)',
    widthMm: 2.25 * IN,
    heightMm: 1.25 * IN,
  },
  { id: 'thermal-2x1', name: '2 × 1 in thermal', widthMm: 2 * IN, heightMm: 1 * IN },
  { id: 'thermal-3x2', name: '3 × 2 in thermal', widthMm: 3 * IN, heightMm: 2 * IN },
  {
    id: 'letter-30',
    name: '30 per sheet, US Letter (2.625 × 1 in, like Avery 5160)',
    widthMm: 2.625 * IN,
    heightMm: 1 * IN,
    sheet: {
      pageWidthMm: 8.5 * IN,
      pageHeightMm: 11 * IN,
      columns: 3,
      rows: 10,
      marginLeftMm: 0.1875 * IN,
      marginTopMm: 0.5 * IN,
      pitchXMm: 2.75 * IN,
      pitchYMm: 1 * IN,
    },
  },
  {
    id: 'a4-24',
    name: '24 per sheet, A4 (63.5 × 33.9 mm, like Avery L7159)',
    widthMm: 63.5,
    heightMm: 33.9,
    sheet: {
      pageWidthMm: 210,
      pageHeightMm: 297,
      columns: 3,
      rows: 8,
      marginLeftMm: 7.2,
      marginTopMm: 12.9,
      pitchXMm: 66,
      pitchYMm: 33.9,
    },
  },
  {
    id: 'a4-21',
    name: '21 per sheet, A4 (63.5 × 38.1 mm, like Avery L7160)',
    widthMm: 63.5,
    heightMm: 38.1,
    sheet: {
      pageWidthMm: 210,
      pageHeightMm: 297,
      columns: 3,
      rows: 7,
      marginLeftMm: 7.2,
      marginTopMm: 15.15,
      pitchXMm: 66,
      pitchYMm: 38.1,
    },
  },
]

export const LABEL_CONDITIONS = [
  'New',
  'Used - Like New',
  'Used - Very Good',
  'Used - Good',
  'Used - Acceptable',
  'Collectible - Like New',
  'Collectible - Very Good',
  'Collectible - Good',
  'Collectible - Acceptable',
  'Refurbished',
] as const

/** Shortens text to fit `maxWidth` by cutting the middle, as Amazon suggests for long titles. */
export function fitMiddle(text: string, fontSize: number, maxWidth: number): string {
  const t = text.trim().replace(/\s+/g, ' ')
  if (textWidth(t, fontSize) <= maxWidth) return t
  const chars = [...t]
  let keep = chars.length
  while (keep > 4) {
    keep--
    const head = Math.ceil(keep / 2)
    const s = `${chars.slice(0, head).join('').trimEnd()}…${chars
      .slice(chars.length - (keep - head))
      .join('')
      .trimStart()}`
    if (textWidth(s, fontSize) <= maxWidth) return s
  }
  return '…'
}

export type FnskuLabel = {
  fnsku: string
  title: string
  condition: string
  size: LabelSize
  /**
   * Thermal printer resolution. Bars are then a whole number of printer dots wide, which keeps
   * them crisp and the barcode readable. Without it (sheet labels), bars are sized in millimetres.
   */
  dpi?: 203 | 300
}

export const LABEL_MARGIN_MM = 1.6

/** One FBA label (barcode, FNSKU, title, condition) as a scene in millimetres. */
export function fnskuLabelScene(label: FnskuLabel): { scene: Scene; moduleMm: number } {
  const { widthMm: w, heightMm: h } = label.size
  const enc = encodeBarcode('fnsku', label.fnsku)
  const quiet = 10
  const total = enc.modules.length + quiet * 2
  const avail = w - LABEL_MARGIN_MM * 2
  let moduleMm: number
  if (label.dpi) {
    const dotMm = IN / label.dpi
    // Whole dots per module: at least 0.19 mm, at most about 0.4 mm.
    const dots = Math.max(1, Math.min(Math.floor(avail / dotMm / total), Math.round(0.4 / dotMm)))
    moduleMm = dots * dotMm
  } else {
    moduleMm = Math.min(0.33, avail / total)
  }
  const barcodeW = enc.modules.length * moduleMm
  let x = (w - barcodeW) / 2
  if (label.dpi) {
    // Start the bars on a printer dot, too.
    const dotMm = IN / label.dpi
    x = Math.round(x / dotMm) * dotMm
  }

  const fnskuSize = Math.min(2.8, h * 0.11)
  const textSize = Math.min(2.4, h * 0.095)
  const lineGap = 0.6
  const textBlock = fnskuSize * CAP_HEIGHT + (textSize * CAP_HEIGHT + lineGap) * 2 + lineGap * 2
  const barTop = LABEL_MARGIN_MM
  const barH = Math.max(6, h - LABEL_MARGIN_MM * 2 - textBlock - 0.8)

  const items: SceneItem[] = [
    { kind: 'path', d: rect(0, 0, w, h), fill: { type: 'solid', color: '#ffffff' } },
    {
      kind: 'path',
      d: barsPath(enc.modules, x, barTop, barH, barH, () => false, moduleMm),
      fill: { type: 'solid', color: '#000000' },
    },
  ]
  let y = barTop + barH + 0.8 + fnskuSize * CAP_HEIGHT
  items.push({ kind: 'text', text: label.fnsku, x: w / 2, y, fontSize: fnskuSize, fill: '#000000' })
  const title = fitMiddle(label.title, textSize, avail)
  if (title) {
    y += lineGap + textSize * CAP_HEIGHT + lineGap
    items.push({ kind: 'text', text: title, x: w / 2, y, fontSize: textSize, fill: '#000000' })
  }
  if (label.condition) {
    y += lineGap + textSize * CAP_HEIGHT + lineGap
    items.push({
      kind: 'text',
      text: label.condition,
      x: w / 2,
      y,
      fontSize: textSize,
      fill: '#000000',
    })
  }
  return { scene: { width: w, height: h, items }, moduleMm }
}

/**
 * The same label for Zebra printers, in ZPL. The printer draws the barcode and text itself at
 * its own resolution, the sharpest result a thermal printer can give.
 */
export function fnskuLabelZpl(label: FnskuLabel & { dpi: 203 | 300 }, copies = 1): string {
  const dpmm = label.dpi / IN
  const dots = (mm: number) => Math.round(mm * dpmm)
  const { widthMm: w, heightMm: h } = label.size
  const enc = encodeBarcode('fnsku', label.fnsku)
  const avail = dots(w - LABEL_MARGIN_MM * 2)
  const moduleDots = Math.max(
    1,
    Math.min(Math.floor(avail / (enc.modules.length + 20)), Math.round(0.4 * dpmm)),
  )
  const barW = enc.modules.length * moduleDots
  const textSize = Math.min(2.4, h * 0.095)
  const fnskuSize = Math.min(2.8, h * 0.11)
  const textBlock = dots(fnskuSize * CAP_HEIGHT + (textSize * CAP_HEIGHT + 0.6) * 2 + 1.2 + 1.6)
  const barH = Math.max(dots(6), dots(h - LABEL_MARGIN_MM * 2) - textBlock)
  const safe = (s: string) => s.replace(/[\^~\\]/g, ' ')
  const title = safe(fitMiddle(label.title, textSize, w - LABEL_MARGIN_MM * 2))
  const pw = dots(w)
  const font = (mm: number) => `^A0N,${dots(mm)},${dots(mm)}`
  let y = dots(LABEL_MARGIN_MM)
  const lines = [
    '^XA',
    '^CI28',
    `^PW${pw}`,
    `^LL${dots(h)}`,
    `^FO${Math.round((pw - barW) / 2)},${y}^BY${moduleDots}^BCN,${barH},N,N,N^FD${label.fnsku}^FS`,
  ]
  y += barH + dots(0.8)
  lines.push(`^FO0,${y}${font(fnskuSize)}^FB${pw},1,0,C^FD${label.fnsku}^FS`)
  y += dots(fnskuSize + 0.6)
  if (title) {
    lines.push(`^FO0,${y}${font(textSize)}^FB${pw},1,0,C^FD${title}^FS`)
    y += dots(textSize + 0.6)
  }
  if (label.condition)
    lines.push(`^FO0,${y}${font(textSize)}^FB${pw},1,0,C^FD${safe(label.condition)}^FS`)
  lines.push(`^PQ${Math.max(1, Math.min(999, Math.floor(copies)))}`, '^XZ')
  return lines.join('\n') + '\n'
}
