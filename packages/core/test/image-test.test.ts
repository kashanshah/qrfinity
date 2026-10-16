import { encode } from 'uqr'
import { describe, expect, it } from 'vitest'
import { measureContrast, measureQuietZone, testReport, type Raster } from '../src'

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))

/** A QR code drawn at `px` pixels per module with `q` modules of margin. */
function draw(text: string, { px = 4, q = 4, fg = '#000000', bg = '#ffffff' } = {}) {
  const qr = encode(text, { ecc: 'M', border: 0 })
  const n = qr.size
  const side = (n + 2 * q) * px
  const data = new Uint8ClampedArray(side * side * 4)
  const [fr, fgG, fb] = hex(fg)
  const [br, bgG, bb] = hex(bg)
  for (let y = 0; y < side; y++)
    for (let x = 0; x < side; x++) {
      const mx = Math.floor(x / px) - q
      const my = Math.floor(y / px) - q
      const dark = mx >= 0 && my >= 0 && mx < n && my < n && qr.data[my]![mx]
      const i = (y * side + x) * 4
      data.set(dark ? [fr!, fgG!, fb!, 255] : [br!, bgG!, bb!, 255], i)
    }
  const a = q * px
  const b = (q + n) * px
  const quad = {
    topLeft: { x: a, y: a },
    topRight: { x: b, y: a },
    bottomRight: { x: b, y: b },
    bottomLeft: { x: a, y: b },
  }
  return { img: { width: side, height: side, data } as Raster, quad, n }
}

describe('QR code tester measurements', () => {
  it('measures contrast between the dark and light parts', () => {
    const black = draw('https://example.com')
    expect(measureContrast(black.img, black.quad).ratio).toBeCloseTo(21, 0)
    const pale = draw('https://example.com', { fg: '#9a9a9a', bg: '#ffffff' })
    const r = measureContrast(pale.img, pale.quad).ratio
    expect(r).toBeGreaterThan(2.5)
    expect(r).toBeLessThan(3.2)
  })

  it('counts the clear margin in modules, and notices a cropped image', () => {
    for (const q of [4, 2]) {
      const { img, quad, n } = draw('https://example.com', { q: q + 1 })
      const { threshold } = measureContrast(img, quad)
      // One extra module of margin, so the count stops on space, not the image edge.
      expect(measureQuietZone(img, quad, n, threshold).modules).toBeGreaterThanOrEqual(q)
    }
    const tight = draw('https://example.com', { q: 1 })
    const { threshold } = measureContrast(tight.img, tight.quad)
    expect(measureQuietZone(tight.img, tight.quad, tight.n, threshold)).toEqual({
      modules: 1,
      atEdge: true,
    })
  })
})

describe('QR code tester report', () => {
  const good = {
    modules: 29,
    version: 3,
    ecLevel: 'M' as const,
    inverted: false,
    contrast: 21,
    quietZone: { modules: 4, atEdge: false },
    smallestModulePx: 1.5,
    survivesBlur: true,
  }

  it('passes a well-made code and gives the print size', () => {
    const r = testReport(good)
    expect(r.verdict).toBe('good')
    expect(r.checks.every((c) => c.status === 'pass')).toBe(true)
    expect(r.minPrintMm).toBe(20)
    expect(testReport({ ...good, modules: 73, version: 14 }).minPrintMm).toBe(33)
  })

  it('fails low contrast or a missing margin, and warns on the rest', () => {
    expect(testReport({ ...good, contrast: 2 }).verdict).toBe('poor')
    expect(testReport({ ...good, quietZone: { modules: 0, atEdge: false } }).verdict).toBe('poor')
    const warned = testReport({
      ...good,
      contrast: 3.5,
      ecLevel: 'L',
      inverted: true,
      version: 12,
      smallestModulePx: null,
      survivesBlur: false,
      quietZone: { modules: 1, atEdge: true },
    })
    expect(warned.verdict).toBe('fair')
    expect(warned.checks.map((c) => c.id).sort()).toEqual(
      ['blur', 'colours', 'contrast', 'density', 'error-correction', 'quiet-zone', 'small'].sort(),
    )
    expect(warned.checks.filter((c) => c.status !== 'warn')).toEqual([])
  })
})

describe('margin at the image edge', () => {
  it('counts a standard 4-module margin even when the corners are a pixel off', () => {
    const { img, quad, n } = draw('https://example.com', { q: 4, px: 12 })
    const off = { x: -0.6, y: -0.6 }
    const shifted = {
      ...quad,
      topLeft: { x: quad.topLeft.x - off.x, y: quad.topLeft.y - off.y },
    }
    const { threshold } = measureContrast(img, shifted)
    const r = measureQuietZone(img, shifted, n, threshold)
    expect(r.modules).toBe(4)
  })
})

describe('margin next to a frame', () => {
  it('counts exactly 4 modules up to a dark frame as a full margin', () => {
    const { img, quad, n } = draw('https://example.com', { q: 6, px: 10 })
    // A dark frame starting exactly 4 modules from the code on every side.
    const a = 2 * 10
    const b = img.width - a
    for (let y = 0; y < img.height; y++)
      for (let x = 0; x < img.width; x++)
        if (x < a || y < a || x >= b || y >= b)
          img.data.set([0, 0, 0, 255], (y * img.width + x) * 4)
    const { threshold } = measureContrast(img, quad)
    expect(measureQuietZone(img, quad, n, threshold)).toEqual({ modules: 4, atEdge: false })
  })
})
