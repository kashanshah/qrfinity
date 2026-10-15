import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DESIGN, DOT_STYLES, EYE_BALL_STYLES, EYE_FRAME_STYLES, FRAME_STYLES, PayloadTooLongError,
  buildScene, sceneToEps, sceneToSvg, textWidth, type Design,
} from '../src'
import { decodeSvg } from './decode'

const URL = 'https://qrfinity.com/guides/do-qr-codes-expire'
// 1×1 transparent-ish PNG, enough to exercise the logo path.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const design = (patch: Partial<Design> = {}): Design => ({ ...DEFAULT_DESIGN, ...patch })
const render = (d: Design, payload = URL) => sceneToSvg(buildScene(payload, d).scene, { width: 600 })

describe('rendering decodes back to the payload', () => {
  it('default design', async () => {
    expect(await decodeSvg(render(design()))).toBe(URL)
  })
  it.each(DOT_STYLES)('dot style %s', async (dotStyle) => {
    expect(await decodeSvg(render(design({ dotStyle })))).toBe(URL)
  })
  it.each(EYE_FRAME_STYLES.flatMap((f) => EYE_BALL_STYLES.map((b) => [f, b] as const)))('eyes %s / %s', async (eyeFrameStyle, eyeBallStyle) => {
    expect(await decodeSvg(render(design({ eyeFrameStyle, eyeBallStyle, dotStyle: 'fluid' })))).toBe(URL)
  })
  it.each(FRAME_STYLES)('frame %s', async (style) => {
    expect(await decodeSvg(render(design({ frame: { ...DEFAULT_DESIGN.frame, style, text: 'Scan for the menu' } })))).toBe(URL)
  })
  it('gradients and eye colours', async () => {
    const d = design({ foreground: { type: 'linear', from: '#0f5132', to: '#14201a', angle: 45 }, eyeFrameColor: '#0a3a24', eyeBallColor: '#14201a' })
    expect(await decodeSvg(render(d))).toBe(URL)
    expect(await decodeSvg(render(design({ foreground: { type: 'radial', from: '#000000', to: '#0f5132' } })))).toBe(URL)
  })
  it('a logo with its area cleared', async () => {
    const d = design({ logo: { src: PNG, width: 1, height: 1 }, logoSize: 0.25 })
    const { info } = buildScene(URL, d)
    expect(info.ecc).toBe('H')
    expect(info.logoCoverage).toBeGreaterThan(0.05)
    expect(await decodeSvg(render(d))).toBe(URL)
  })
  it('non-Latin text', async () => {
    const text = 'Привет, мир — こんにちは 👋'
    expect(await decodeSvg(render(design(), text))).toBe(text)
  })
})

describe('broken designs do not decode', () => {
  it('near-identical colours', async () => {
    expect(await decodeSvg(render(design({ foreground: { type: 'solid', color: '#f4f4f4' } })))).toBeNull()
  })
})

describe('scene', () => {
  it('auto error correction is M, H with a logo, and respects a manual choice', () => {
    expect(buildScene(URL, design()).info.ecc).toBe('M')
    expect(buildScene(URL, design({ ecc: 'L' })).info.ecc).toBe('L')
    expect(buildScene(URL, design({ ecc: 'L', logo: { src: PNG, width: 1, height: 1 } })).info.ecc).toBe('H')
  })
  it('includes the quiet zone in its size', () => {
    const { info } = buildScene(URL, design({ quietZone: 4 }))
    expect(info.sizeWithQuietZone).toBe(info.size + 8)
  })
  it('throws a friendly error when the content is too long', () => {
    expect(() => buildScene('x'.repeat(5000), design())).toThrow(PayloadTooLongError)
  })
  it('omits the background when transparent', () => {
    const svg = render(design({ transparentBackground: true }))
    expect(svg).not.toContain('fill="#ffffff"')
  })
  it('escapes frame text and drops non-image logos', () => {
    const svg = render(design({ logo: { src: 'javascript:alert(1)', width: 1, height: 1 }, frame: { ...DEFAULT_DESIGN.frame, style: 'box-bottom', text: '<b>&' } }))
    expect(svg).toContain('&lt;b&gt;&amp;')
    expect(svg).not.toContain('javascript:')
  })
  it('has Helvetica widths for all printable ASCII', () => {
    expect(textWidth('A', 1000)).toBe(722)
    expect(textWidth('~', 1000)).toBe(584)
  })
})

describe('eps', () => {
  it('writes a well-formed EPS with vector paths, gradient and label', () => {
    const d = design({
      foreground: { type: 'linear', from: '#000000', to: '#0f5132', angle: 90 },
      frame: { ...DEFAULT_DESIGN.frame, style: 'box-bottom', text: 'Café (menu)' },
      logo: { src: PNG, width: 1, height: 1 },
    })
    const eps = sceneToEps(buildScene(URL, d).scene, {
      widthPt: 144,
      logoPixels: { width: 2, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 0]) },
    })
    expect(eps.startsWith('%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 144 ')).toBe(true)
    expect(eps).toContain('/ShadingType 2')
    expect(eps).toContain('eofill')
    expect(eps).toContain('(Caf\\351 \\(menu\\)) dup stringwidth')
    expect(eps).toContain('ff0000ffffff>')
    expect(eps.trimEnd().endsWith('%%EOF')).toBe(true)
    expect(eps).not.toMatch(/[^\x0a\x20-\x7e]/)
  })
})
