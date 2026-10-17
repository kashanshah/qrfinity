import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { prepareZXingModule, writeBarcode } from 'zxing-wasm/writer'
import {
  MATRIX_FORMAT,
  MATRIX_QUIET,
  checkMatrixValue,
  matrixScene,
  sceneToEps,
  sceneToSvg,
  type MatrixType,
} from '../src/index'
import { decodeSvg } from './decode'

const require = createRequire(import.meta.url)
const wasm = readFileSync(require.resolve('zxing-wasm/writer/zxing_writer.wasm'))
prepareZXingModule({
  overrides: { wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) },
})

const style = { foreground: '#000000', background: '#ffffff', transparent: false }

async function grid(type: MatrixType, text: string) {
  const r = await writeBarcode(text, {
    format: MATRIX_FORMAT[type],
    options: type === 'datamatrix' ? 'forceSquare' : '',
    scale: 1,
    addQuietZones: false,
  })
  if (r.error) throw new Error(r.error)
  return r.symbol
}

describe('2D barcodes', () => {
  it('checks the input', () => {
    expect(checkMatrixValue('datamatrix', '')).toMatchObject({ ok: false })
    expect(checkMatrixValue('pdf417', 'x'.repeat(801))).toMatchObject({ ok: false })
    expect(checkMatrixValue('aztec', 'Line 1\nLine 2')).toEqual({
      ok: true,
      value: 'Line 1\nLine 2',
    })
  })

  const text = 'SKU A-1042 / Lot 7 / Café'
  for (const type of ['datamatrix', 'pdf417', 'aztec'] as const) {
    it(`${type} draws from the writer's grid and scans`, async () => {
      const g = await grid(type, text)
      if (type === 'datamatrix') expect(g.width).toBe(g.height)
      const scene = matrixScene(g, style, MATRIX_QUIET[type])
      expect(scene.width).toBe(g.width + MATRIX_QUIET[type] * 2)
      const px = scene.width * 6
      expect(await decodeSvg(sceneToSvg(scene, { width: px }), px, [MATRIX_FORMAT[type]])).toBe(
        text,
      )
      expect(sceneToEps(scene, { widthPt: 100 })).toContain('%%BoundingBox')
    })
  }
})
