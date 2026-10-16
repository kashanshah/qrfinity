/**
 * The QR code tester: measurements taken from an uploaded design (any generator's), and the
 * plain-language report built from them. Pure functions over RGBA pixels, so they run in the
 * browser and in tests alike.
 */
import { MIN_MODULE_MM, MIN_PRINT_MM } from './checks'

export type Raster = { width: number; height: number; data: Uint8ClampedArray }
export type Point = { x: number; y: number }
/** The code's outer corners in the image, as the decoder reports them. */
export type Quad = { topLeft: Point; topRight: Point; bottomRight: Point; bottomLeft: Point }

const channel = (v: number) => {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
/** WCAG relative luminance of an sRGB colour (0–1). */
export const relativeLuminance = (r: number, g: number, b: number) =>
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)

function bounds(q: Quad) {
  const xs = [q.topLeft.x, q.topRight.x, q.bottomRight.x, q.bottomLeft.x]
  const ys = [q.topLeft.y, q.topRight.y, q.bottomRight.y, q.bottomLeft.y]
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }
}

function inside(q: Quad, x: number, y: number) {
  const pts = [q.topLeft, q.topRight, q.bottomRight, q.bottomLeft]
  let sign = 0
  for (let i = 0; i < 4; i++) {
    const a = pts[i]!
    const b = pts[(i + 1) % 4]!
    const cross = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x)
    if (cross !== 0) {
      if (sign === 0) sign = Math.sign(cross)
      else if (Math.sign(cross) !== sign) return false
    }
  }
  return true
}

/** Otsu's threshold over 0–255 values: the split that best separates two groups. */
function otsu(values: number[]) {
  const hist = new Array<number>(256).fill(0)
  for (const v of values) hist[Math.max(0, Math.min(255, Math.round(v)))]!++
  const total = values.length
  let sum = 0
  for (let i = 0; i < 256; i++) sum += i * hist[i]!
  let sumB = 0
  let wB = 0
  let best = 0
  let threshold = 127
  for (let t = 0; t < 256; t++) {
    wB += hist[t]!
    if (!wB) continue
    const wF = total - wB
    if (!wF) break
    sumB += t * hist[t]!
    const between = wB * wF * (sumB / wB - (sum - sumB) / wF) ** 2
    if (between > best) {
      best = between
      threshold = t
    }
  }
  return threshold
}

const grey = (d: Uint8ClampedArray, i: number) =>
  0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!

export type ContrastMeasure = {
  /** WCAG contrast ratio between the average dark and average light colour. */
  ratio: number
  /** Grey level (0–255) that splits dark from light, for the other measurements. */
  threshold: number
}

/** Contrast between the dark and light parts of the code. */
export function measureContrast(img: Raster, quad: Quad): ContrastMeasure {
  const { x0, x1, y0, y1 } = bounds(quad)
  const area = Math.max(1, (x1 - x0) * (y1 - y0))
  const step = Math.max(1, Math.floor(Math.sqrt(area / 40000)))
  const samples: { g: number; i: number }[] = []
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(img.height, y1); y += step)
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(img.width, x1); x += step) {
      if (!inside(quad, x + 0.5, y + 0.5)) continue
      const i = (y * img.width + x) * 4
      samples.push({ g: grey(img.data, i), i })
    }
  const threshold = otsu(samples.map((s) => s.g))
  const mean = (group: typeof samples) => {
    const n = Math.max(1, group.length)
    let r = 0
    let g = 0
    let b = 0
    for (const s of group) {
      r += img.data[s.i]!
      g += img.data[s.i + 1]!
      b += img.data[s.i + 2]!
    }
    return relativeLuminance(r / n, g / n, b / n)
  }
  const dark = samples.filter((s) => s.g <= threshold)
  const light = samples.filter((s) => s.g > threshold)
  const ld = mean(dark)
  const ll = mean(light)
  return {
    ratio: (Math.max(ld, ll) + 0.05) / (Math.min(ld, ll) + 0.05),
    threshold,
  }
}

export type QuietZoneMeasure = {
  /** Whole modules of clear space on the tightest side (capped at 6). */
  modules: number
  /** The tightest side runs into the edge of the image (the design may add space later). */
  atEdge: boolean
}

/**
 * Clear space around the code, in modules, on its tightest side. Space counts as clear when at
 * least 97% of a module-wide strip matches the background (light, or dark for inverted codes).
 */
export function measureQuietZone(
  img: Raster,
  quad: Quad,
  modules: number,
  threshold: number,
  inverted = false,
): QuietZoneMeasure {
  const { x0, x1, y0, y1 } = bounds(quad)
  const m = (x1 - x0 + (y1 - y0)) / 2 / Math.max(1, modules)
  const background = (x: number, y: number) => {
    const g = grey(img.data, (y * img.width + x) * 4)
    return inverted ? g <= threshold : g > threshold
  }
  const strip = (ax: number, ay: number, bx: number, by: number) => {
    let clear = 0
    let n = 0
    for (let y = Math.floor(ay); y < by; y++)
      for (let x = Math.floor(ax); x < bx; x++) {
        n++
        if (background(x, y)) clear++
      }
    return n === 0 ? 1 : clear / n
  }
  // The outer quarter of each strip is left out: something exactly 4 modules away (a frame) is
  // a full 4-module margin, even after rounding to pixels.
  const e = m / 4
  const sides = [
    (k: number) => [x0, y0 - k * m + e, x1, y0 - (k - 1) * m], // top
    (k: number) => [x0, y1 + (k - 1) * m, x1, y1 + k * m - e], // bottom
    (k: number) => [x0 - k * m + e, y0, x0 - (k - 1) * m, y1], // left
    (k: number) => [x1 + (k - 1) * m, y0, x1 + k * m - e, y1], // right
  ]
  let min = 6
  let atEdge = false
  for (const side of sides) {
    let k = 1
    let edge = false
    for (; k <= 6; k++) {
      const [ax, ay, bx, by] = side(k) as [number, number, number, number]
      // Corners are rounded to whole pixels: up to half a module past the edge still counts.
      if (Math.max(-ax, -ay, bx - img.width, by - img.height) > m / 4) {
        edge = true
        break
      }
      const clip = (v: number, max: number) => Math.min(max, Math.max(0, v))
      if (
        strip(
          clip(ax, img.width),
          clip(ay, img.height),
          clip(bx, img.width),
          clip(by, img.height),
        ) < 0.97
      )
        break
    }
    const clear = k - 1
    if (clear < min || (clear === min && edge)) {
      min = clear
      atEdge = edge
    }
  }
  return { modules: min, atEdge }
}

export type TestMeasurements = {
  /** Modules per side, without the quiet zone. */
  modules: number
  version: number
  ecLevel: 'L' | 'M' | 'Q' | 'H' | null
  inverted: boolean
  contrast: number
  quietZone: QuietZoneMeasure
  /** Smallest module size (px) that still decoded; null when only the original size reads. */
  smallestModulePx: number | null
  /** Still decodes with a blur about a third of a module wide (a slightly unfocused camera). */
  survivesBlur: boolean
}

export type TestCheck = {
  id: 'contrast' | 'quiet-zone' | 'small' | 'blur' | 'error-correction' | 'colours' | 'density'
  status: 'pass' | 'warn' | 'fail'
  title: string
  detail: string
}

export type TestReport = {
  verdict: 'good' | 'fair' | 'poor'
  checks: TestCheck[]
  /** Smallest sensible print width, quiet zone included. */
  minPrintMm: number
}

/** The tester's report: one check per thing that makes codes fail in the real world. */
export function testReport(t: TestMeasurements): TestReport {
  const checks: TestCheck[] = []
  const ratio = Math.round(t.contrast * 10) / 10

  checks.push(
    t.contrast < 3
      ? {
          id: 'contrast',
          status: 'fail',
          title: 'Contrast is too low',
          detail: `The dark and light parts differ by only ${ratio}:1. Cameras need at least 3:1; make the code darker or the background lighter.`,
        }
      : t.contrast < 4.5
        ? {
            id: 'contrast',
            status: 'warn',
            title: 'Contrast is borderline',
            detail: `${ratio}:1 reads in good light, but dim rooms and glare make it harder. Aim for 4.5:1 or more.`,
          }
        : {
            id: 'contrast',
            status: 'pass',
            title: 'Strong contrast',
            detail: `${ratio}:1 between the dark and light parts.`,
          },
  )

  const q = t.quietZone
  checks.push(
    q.atEdge && q.modules < 4
      ? {
          id: 'quiet-zone',
          status: 'warn',
          title: 'Cropped close',
          detail: `The image ends ${q.modules === 0 ? 'right at the code' : `${q.modules} ${q.modules === 1 ? 'module' : 'modules'} from the code`}. When you place it, leave a blank margin of 4 modules (about ${Math.round((4 / t.modules) * 100)}% of the code's width) on every side.`,
        }
      : q.modules < 2
        ? {
            id: 'quiet-zone',
            status: 'fail',
            title: 'No margin around the code',
            detail: `Something sits ${q.modules === 0 ? 'right against' : 'about a module from'} the code. Phones need a blank margin to find it: leave 4 modules on every side.`,
          }
        : q.modules < 4
          ? {
              id: 'quiet-zone',
              status: 'warn',
              title: 'Narrow margin',
              detail: `${q.modules} modules of blank space; the standard asks for 4. Most phones cope, some older scanners don't.`,
            }
          : {
              id: 'quiet-zone',
              status: 'pass',
              title: 'Clear margin',
              detail: 'At least 4 modules of blank space around the code.',
            },
  )

  checks.push(
    t.smallestModulePx === null
      ? {
          id: 'small',
          status: 'warn',
          title: 'Reads only at full size',
          detail: 'Shrunk down, it stopped reading. Print it larger than usual, and sharp.',
        }
      : t.smallestModulePx <= 2
        ? {
            id: 'small',
            status: 'pass',
            title: 'Reads when small',
            detail:
              'It still read when shrunk to 2 pixels per module, like a code seen from across a room.',
          }
        : {
            id: 'small',
            status: 'warn',
            title: 'Struggles when small',
            detail: `It stopped reading below ${t.smallestModulePx} pixels per module. Print it a little larger, or simplify the design.`,
          },
  )

  checks.push(
    t.survivesBlur
      ? {
          id: 'blur',
          status: 'pass',
          title: 'Reads when blurry',
          detail: 'It still read with blur, like a phone that hasn’t quite focused.',
        }
      : {
          id: 'blur',
          status: 'warn',
          title: 'Sensitive to blur',
          detail:
            'A slightly out-of-focus camera may miss it. Stronger contrast, a plainer pattern or a larger print helps.',
        },
  )

  if (t.ecLevel) {
    checks.push(
      t.ecLevel === 'L'
        ? {
            id: 'error-correction',
            status: 'warn',
            title: 'Low error correction (L)',
            detail:
              'It can lose only about 7% before it stops reading, so scratches, dirt or a logo can break it. For print, choose M or higher.',
          }
        : {
            id: 'error-correction',
            status: 'pass',
            title: `Error correction ${t.ecLevel}`,
            detail: `It can still read with about ${{ M: 15, Q: 25, H: 30 }[t.ecLevel]}% of it damaged or covered.`,
          },
    )
  }

  if (t.inverted)
    checks.push({
      id: 'colours',
      status: 'warn',
      title: 'Light on dark',
      detail:
        'Phone cameras read inverted codes, but some older scanner apps and payment terminals don’t. Dark on light is safest.',
    })

  checks.push(
    t.version >= 11
      ? {
          id: 'density',
          status: 'warn',
          title: 'Dense code',
          detail: `${t.modules} × ${t.modules} modules (version ${t.version}). It needs a bigger print to read reliably. A shorter link, or a dynamic code, makes it simpler.`,
        }
      : {
          id: 'density',
          status: 'pass',
          title: 'Simple enough',
          detail: `${t.modules} × ${t.modules} modules (version ${t.version}).`,
        },
  )

  const minPrintMm = Math.max(MIN_PRINT_MM, Math.ceil((t.modules + 8) * MIN_MODULE_MM))
  const verdict = checks.some((c) => c.status === 'fail')
    ? 'poor'
    : checks.some((c) => c.status === 'warn')
      ? 'fair'
      : 'good'
  return { verdict, checks, minPrintMm }
}
