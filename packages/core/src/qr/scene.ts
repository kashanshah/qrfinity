/**
 * Builds a format-neutral "scene" (paths, an image and text, in module units) from a
 * payload and a design. SVG and EPS writers serialise the same scene, so every export
 * format draws exactly the same code.
 */
import { encode, QrCodeDataType } from 'uqr'
import { effectiveEcc, isVectorLogo, type Design, type EccLevel, type Fill } from './design'
import { CAP_HEIGHT, textWidth } from './font'
import { fmt, PathBuilder } from './path'

export type Paint =
  | { type: 'solid'; color: string }
  | { type: 'linear'; x1: number; y1: number; x2: number; y2: number; from: string; to: string }
  | { type: 'radial'; cx: number; cy: number; r: number; from: string; to: string }

export type SceneItem =
  | { kind: 'path'; d: string; fill: Paint; evenOdd?: boolean }
  | { kind: 'image'; href: string; x: number; y: number; width: number; height: number }
  | { kind: 'text'; text: string; x: number; y: number; fontSize: number; fill: string }

export type Scene = { width: number; height: number; items: SceneItem[] }

export type SceneInfo = {
  version: number
  /** Modules per side, without the quiet zone. */
  size: number
  ecc: EccLevel
  /** Modules per side including the quiet zone (what print size is based on). */
  sizeWithQuietZone: number
  /** Share of the data area hidden by the logo (0–1). */
  logoCoverage: number
  /** The code's square (quiet zone included) inside the scene, in scene units. */
  codeBox: { x: number; y: number; size: number }
}

export type SceneResult = { scene: Scene; info: SceneInfo }

export class PayloadTooLongError extends Error {
  constructor() {
    super('That is more than a QR code can hold. Shorten the content.')
    this.name = 'PayloadTooLongError'
  }
}

type Corners = [number, number, number, number]

/** Leaf shapes mirror per eye so the rounded corners face outwards. */
function leafCorners(r: number, eye: 'tl' | 'tr' | 'bl'): Corners {
  return eye === 'tl' ? [r, 0, r, 0] : [0, r, 0, r]
}

function eyeFrameCorners(style: Design['eyeFrameStyle'], eye: 'tl' | 'tr' | 'bl') {
  switch (style) {
    case 'square':
      return { outer: [0, 0, 0, 0] as Corners, inner: [0, 0, 0, 0] as Corners }
    case 'rounded':
      return { outer: [2, 2, 2, 2] as Corners, inner: [1, 1, 1, 1] as Corners }
    case 'circle':
      return { outer: [3.5, 3.5, 3.5, 3.5] as Corners, inner: [2.5, 2.5, 2.5, 2.5] as Corners }
    case 'leaf':
      return { outer: leafCorners(3, eye), inner: leafCorners(2, eye) }
  }
}

function eyeBallCorners(style: Design['eyeBallStyle'], eye: 'tl' | 'tr' | 'bl'): Corners {
  switch (style) {
    case 'square':
      return [0, 0, 0, 0]
    case 'rounded':
      return [0.8, 0.8, 0.8, 0.8]
    case 'circle':
      return [1.5, 1.5, 1.5, 1.5]
    case 'leaf':
      return leafCorners(1.5, eye)
  }
}

function toPaint(fill: Fill, x: number, y: number, size: number): Paint {
  if (fill.type === 'solid') return { type: 'solid', color: fill.color }
  const cx = x + size / 2
  const cy = y + size / 2
  if (fill.type === 'radial') {
    return { type: 'radial', cx, cy, r: (size / 2) * Math.SQRT2, from: fill.from, to: fill.to }
  }
  const rad = (fill.angle * Math.PI) / 180
  const dx = Math.cos(rad)
  const dy = Math.sin(rad)
  const half = ((Math.abs(dx) + Math.abs(dy)) * size) / 2
  return {
    type: 'linear',
    x1: cx - dx * half,
    y1: cy - dy * half,
    x2: cx + dx * half,
    y2: cy + dy * half,
    from: fill.from,
    to: fill.to,
  }
}

export function buildScene(payload: string, design: Design): SceneResult {
  const ecc = effectiveEcc(design)
  let qr: ReturnType<typeof encode>
  try {
    qr = encode(payload, { ecc, border: 0 })
  } catch {
    throw new PayloadTooLongError()
  }
  const n = qr.size
  const q = Math.max(0, Math.min(10, Math.round(design.quietZone)))
  const S = n + 2 * q

  // ---- Frame layout: where the code square sits inside the whole image.
  const frame = design.frame
  let width = S
  let height = S
  let codeX = 0
  let codeY = 0
  const items: SceneItem[] = []
  const bg: Paint = { type: 'solid', color: design.background }
  const frameItems: SceneItem[] = []

  if (frame.style === 'box-bottom' || frame.style === 'box-top') {
    const b = Math.max(0.8, S * 0.04)
    const radius = S * 0.06
    const label = S * 0.2
    const innerR = q >= 1 ? Math.max(0, radius - b) : 0
    width = S + 2 * b
    height = S + 2 * b + label - b
    codeX = b
    codeY = frame.style === 'box-bottom' ? b : label
    const ring = new PathBuilder()
      .roundedRect(0, 0, width, height, [radius, radius, radius, radius])
      // Inner corners stay square without a quiet zone, so they never clip an eye.
      .roundedRect(codeX, codeY, S, S, [innerR, innerR, innerR, innerR])
    if (!design.transparentBackground) {
      items.push({
        kind: 'path',
        d: new PathBuilder().rect(codeX, codeY, S, S).toString(),
        fill: bg,
      })
    }
    frameItems.push({
      kind: 'path',
      d: ring.toString(),
      fill: { type: 'solid', color: frame.color },
      evenOdd: true,
    })
    const bandTop = frame.style === 'box-bottom' ? b + S : 0
    const bandHeight = frame.style === 'box-bottom' ? height - bandTop : label
    pushLabel(
      frameItems,
      frame.text,
      frame.textColor,
      width / 2,
      bandTop + bandHeight / 2,
      bandHeight * 0.5,
      width - 2 * b - bandHeight * 0.6,
    )
  } else if (frame.style === 'pill-bottom') {
    const gap = S * 0.05
    const pillH = S * 0.17
    width = S
    height = S + gap + pillH
    if (!design.transparentBackground) {
      items.push({
        kind: 'path',
        d: new PathBuilder().rect(0, 0, width, height).toString(),
        fill: bg,
      })
    }
    const pillW = S - 2 * Math.max(q, 1) * 0.5
    const px = (S - pillW) / 2
    const r = pillH / 2
    frameItems.push({
      kind: 'path',
      d: new PathBuilder().roundedRect(px, S + gap, pillW, pillH, [r, r, r, r]).toString(),
      fill: { type: 'solid', color: frame.color },
    })
    pushLabel(
      frameItems,
      frame.text,
      frame.textColor,
      width / 2,
      S + gap + pillH / 2,
      pillH * 0.55,
      pillW - pillH,
    )
  } else if (!design.transparentBackground) {
    items.push({ kind: 'path', d: new PathBuilder().rect(0, 0, S, S).toString(), fill: bg })
  }

  // ---- Logo box and the modules it clears.
  const ox = codeX + q
  const oy = codeY + q
  let logoBox: { x: number; y: number; w: number; h: number } | null = null
  if (design.logo) {
    const d = Math.max(0.05, Math.min(0.35, design.logoSize)) * n
    const ratio = design.logo.height / design.logo.width || 1
    const w = ratio <= 1 ? d : d / ratio
    const h = ratio <= 1 ? d * ratio : d
    logoBox = { x: (n - w) / 2, y: (n - h) / 2, w, h }
  }
  const m = design.logoMargin
  const clear = logoBox
    ? {
        x0: logoBox.x - m,
        y0: logoBox.y - m,
        x1: logoBox.x + logoBox.w + m,
        y1: logoBox.y + logoBox.h + m,
      }
    : null
  const covered = (r: number, c: number) =>
    !!clear && c + 1 > clear.x0 && c < clear.x1 && r + 1 > clear.y0 && r < clear.y1

  let dataCells = 0
  let coveredCells = 0
  const shown: boolean[][] = qr.data.map((row, r) =>
    row.map((dark, c) => {
      const type = qr.types[r]![c]!
      if (type === QrCodeDataType.Position) return false
      if (type === QrCodeDataType.Data) {
        dataCells++
        if (covered(r, c)) coveredCells++
      }
      if (design.logo && design.clearBehindLogo && covered(r, c)) return false
      return dark
    }),
  )
  const isOn = (r: number, c: number) => !!shown[r]?.[c]

  // ---- Data modules, one path.
  const dots = new PathBuilder()
  const style = design.dotStyle
  for (let r = 0; r < n; r++) {
    if (style === 'square') {
      // Merge horizontal runs so the path stays small and rasterises without seams.
      let c = 0
      while (c < n) {
        if (!isOn(r, c)) {
          c++
          continue
        }
        const start = c
        while (c < n && isOn(r, c)) c++
        dots.rect(ox + start, oy + r, c - start, 1)
      }
      continue
    }
    for (let c = 0; c < n; c++) {
      if (!isOn(r, c)) continue
      const x = ox + c
      const y = oy + r
      if (style === 'dots') dots.circle(x + 0.5, y + 0.5, 0.5)
      else if (style === 'diamond') dots.diamond(x, y, 1, 1)
      else if (style === 'rounded')
        dots.roundedRect(x + 0.04, y + 0.04, 0.92, 0.92, [0.3, 0.3, 0.3, 0.3])
      else {
        // fluid: round a corner only where both neighbours beside it are empty.
        const up = isOn(r - 1, c)
        const down = isOn(r + 1, c)
        const left = isOn(r, c - 1)
        const right = isOn(r, c + 1)
        const rr = 0.5
        dots.roundedRect(x, y, 1, 1, [
          !up && !left ? rr : 0,
          !up && !right ? rr : 0,
          !down && !right ? rr : 0,
          !down && !left ? rr : 0,
        ])
      }
    }
  }
  const codePaint = toPaint(design.foreground, ox, oy, n)
  if (!dots.isEmpty()) items.push({ kind: 'path', d: dots.toString(), fill: codePaint })

  // ---- Finder patterns ("eyes").
  const eyes: Array<{ eye: 'tl' | 'tr' | 'bl'; x: number; y: number }> = [
    { eye: 'tl', x: ox, y: oy },
    { eye: 'tr', x: ox + n - 7, y: oy },
    { eye: 'bl', x: ox, y: oy + n - 7 },
  ]
  const frames = new PathBuilder()
  const balls = new PathBuilder()
  for (const { eye, x, y } of eyes) {
    const fc = eyeFrameCorners(design.eyeFrameStyle, eye)
    frames.roundedRect(x, y, 7, 7, fc.outer).roundedRect(x + 1, y + 1, 5, 5, fc.inner)
    balls.roundedRect(x + 2, y + 2, 3, 3, eyeBallCorners(design.eyeBallStyle, eye))
  }
  items.push({
    kind: 'path',
    d: frames.toString(),
    fill: design.eyeFrameColor ? { type: 'solid', color: design.eyeFrameColor } : codePaint,
    evenOdd: true,
  })
  items.push({
    kind: 'path',
    d: balls.toString(),
    fill: design.eyeBallColor ? { type: 'solid', color: design.eyeBallColor } : codePaint,
  })

  if (design.logo && logoBox) {
    const logo = design.logo
    if (isVectorLogo(logo)) {
      // Fit the logo's box into the logo area, keeping its shape (as the image's "meet" does).
      const k = Math.min(logoBox.w / logo.width, logoBox.h / logo.height)
      const lx = ox + logoBox.x + (logoBox.w - logo.width * k) / 2
      const ly = oy + logoBox.y + (logoBox.h - logo.height * k) / 2
      for (const p of logo.paths) {
        items.push({
          kind: 'path',
          d: transformPath(p.d, k, lx, ly),
          fill: { type: 'solid', color: p.fill },
        })
      }
    } else {
      items.push({
        kind: 'image',
        href: logo.src,
        x: ox + logoBox.x,
        y: oy + logoBox.y,
        width: logoBox.w,
        height: logoBox.h,
      })
    }
  }

  items.push(...frameItems)

  return {
    scene: { width, height, items },
    info: {
      version: qr.version,
      size: n,
      ecc,
      sizeWithQuietZone: S,
      logoCoverage: dataCells ? coveredCells / dataCells : 0,
      codeBox: { x: codeX, y: codeY, size: S },
    },
  }
}

/** Adds centred label text, shrinking it to fit `maxWidth`. */
function pushLabel(
  items: SceneItem[],
  text: string,
  color: string,
  cx: number,
  cy: number,
  fontSize: number,
  maxWidth: number,
) {
  const value = text.trim()
  if (!value) return
  const w = textWidth(value, fontSize)
  const size = w > maxWidth ? (fontSize * maxWidth) / w : fontSize
  items.push({
    kind: 'text',
    text: value,
    x: cx,
    y: cy + (size * CAP_HEIGHT) / 2,
    fontSize: size,
    fill: color,
  })
}

/** Scales an M/L/C/Z path by `k` and moves it to (x, y). */
function transformPath(d: string, k: number, x: number, y: number): string {
  return d.replace(/([MLCZ])([^MLCZ]*)/g, (_, op: string, args: string) => {
    const nums = args.trim()
      ? args
          .trim()
          .split(/[\s,]+/)
          .map(Number)
      : []
    return op + nums.map((v, i) => fmt(i % 2 === 0 ? x + v * k : y + v * k)).join(' ')
  })
}
