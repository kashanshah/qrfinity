import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_DESIGN, buildScene, sceneToEps } from '../src'
import { decodeSvg } from './decode'

const hasGhostscript = (() => {
  try {
    execFileSync('gs', ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()

describe.skipIf(!hasGhostscript)('EPS renders in Ghostscript and decodes', () => {
  it.each(['square', 'fluid'] as const)('%s pattern with gradient and frame', async (dotStyle) => {
    const url = 'https://qrfinity.com/eps-check'
    const design = {
      ...DEFAULT_DESIGN,
      dotStyle,
      foreground: { type: 'radial' as const, from: '#000000', to: '#0f5132' },
      frame: { ...DEFAULT_DESIGN.frame, style: 'box-bottom' as const, text: 'Scan me' },
    }
    const dir = mkdtempSync(join(tmpdir(), 'qrf-eps-'))
    writeFileSync(join(dir, 'a.eps'), sceneToEps(buildScene(url, design).scene, { widthPt: 144 }))
    execFileSync('gs', [
      '-q',
      '-dSAFER',
      '-dBATCH',
      '-dNOPAUSE',
      '-dEPSCrop',
      '-sDEVICE=png16m',
      '-r300',
      `-sOutputFile=${join(dir, 'a.png')}`,
      join(dir, 'a.eps'),
    ])
    const b64 = readFileSync(join(dir, 'a.png')).toString('base64')
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="700" viewBox="0 0 600 700"><image href="data:image/png;base64,${b64}" width="600" height="700" preserveAspectRatio="xMidYMin meet"/></svg>`
    expect(await decodeSvg(svg, 600)).toBe(url)
  })
})
