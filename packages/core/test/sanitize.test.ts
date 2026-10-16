import { describe, expect, it } from 'vitest'
import { DEFAULT_DESIGN, sanitizeDesign } from '../src'

describe('sanitizeDesign', () => {
  it('keeps a valid design unchanged', () => {
    const d = {
      ...DEFAULT_DESIGN,
      dotStyle: 'dots' as const,
      foreground: { type: 'linear' as const, from: '#0f5132', to: '#14201a', angle: 90 },
    }
    expect(sanitizeDesign(JSON.parse(JSON.stringify(d)))).toEqual(d)
  })
  it('replaces junk with defaults and clamps numbers', () => {
    const d = sanitizeDesign({
      dotStyle: 'evil',
      foreground: { type: 'solid', color: 'red"><script>' },
      background: 'url(javascript:alert(1))',
      quietZone: 999,
      logoSize: -5,
      frame: { style: 'box-top', text: 'x'.repeat(100), color: '#abc' },
      extra: 'dropped',
    })
    expect(d.dotStyle).toBe('square')
    expect(d.foreground).toEqual({ type: 'solid', color: '#000000' })
    expect(d.background).toBe('#ffffff')
    expect(d.quietZone).toBe(10)
    expect(d.logoSize).toBe(0.1)
    expect(d.frame).toEqual({
      style: 'box-top',
      text: 'x'.repeat(32),
      color: '#aabbcc',
      textColor: '#ffffff',
    })
    expect('extra' in d).toBe(false)
  })
  it('accepts only small image data URLs as logos', () => {
    expect(
      sanitizeDesign({ logo: { src: 'data:image/png;base64,iVBORw0KGgo=', width: 10, height: 10 } })
        .logo,
    ).not.toBeNull()
    expect(
      sanitizeDesign({ logo: { src: 'https://evil.example/x.png', width: 1, height: 1 } }).logo,
    ).toBeNull()
    expect(
      sanitizeDesign({ logo: { src: 'data:image/svg+xml;base64,PHN2Zz4=', width: 1, height: 1 } })
        .logo,
    ).toBeNull()
    expect(
      sanitizeDesign({
        logo: { src: 'data:image/png;base64,' + 'A'.repeat(1_000_001), width: 1, height: 1 },
      }).logo,
    ).toBeNull()
  })
  it('survives non-objects', () => {
    expect(sanitizeDesign(null)).toEqual(sanitizeDesign({}))
    expect(sanitizeDesign('nope').dotStyle).toBe('square')
  })
})
