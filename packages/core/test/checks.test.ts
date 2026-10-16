import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DESIGN,
  buildScene,
  checkDesign,
  formatPrintSize,
  minPrintSizeMm,
  type Design,
} from '../src'

const URL = 'https://qrfinity.com'
const run = (patch: Partial<Design> = {}, printMm?: number) => {
  const d = { ...DEFAULT_DESIGN, ...patch }
  return checkDesign(d, buildScene(URL, d).info, printMm)
}
const ids = (r: ReturnType<typeof run>) => [...r.blockers, ...r.warnings].map((i) => i.id)

describe('checkDesign', () => {
  it('the default design has no issues', () => {
    const r = run()
    expect(r.blockers).toEqual([])
    expect(r.warnings).toEqual([])
  })
  it('blocks low contrast and warns on moderate contrast', () => {
    expect(
      run({ foreground: { type: 'solid', color: '#f5c542' } }).blockers.map((b) => b.id),
    ).toEqual(['low-contrast'])
    expect(ids(run({ foreground: { type: 'solid', color: '#e05a00' } }))).toContain('weak-contrast')
  })
  it('checks every gradient stop and eye colour', () => {
    expect(
      run({ foreground: { type: 'linear', from: '#000000', to: '#eeeeee', angle: 0 } }).blockers,
    ).toHaveLength(1)
    expect(run({ eyeBallColor: '#fafafa' }).blockers).toHaveLength(1)
  })
  it('warns on inverted, transparent, tiny margin and too-small print', () => {
    expect(
      ids(run({ foreground: { type: 'solid', color: '#ffffff' }, background: '#000000' })),
    ).toContain('inverted')
    expect(ids(run({ transparentBackground: true }))).toContain('transparent')
    expect(ids(run({ quietZone: 1 }))).toContain('quiet-zone')
    expect(ids(run({}, 10))).toContain('too-small')
  })
  it('recommends a minimum print size', () => {
    expect(minPrintSizeMm({ sizeWithQuietZone: 29 })).toBe(20)
    expect(minPrintSizeMm({ sizeWithQuietZone: 85 })).toBe(34)
    expect(formatPrintSize(20)).toBe('2.0 cm (0.8 in)')
  })
})
