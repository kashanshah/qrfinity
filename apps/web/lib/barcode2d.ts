'use client'

/**
 * Builds 2D barcode grids (Data Matrix, PDF417, Aztec) with the zxing writer. The writer and its
 * wasm load only when a 2D type is chosen, from our own server (public/wasm), never a CDN.
 */
import { MATRIX_FORMAT, type MatrixType, type ModuleGrid } from '@qrfinity/core'

type Writer = typeof import('zxing-wasm/writer')
let writer: Promise<Writer> | null = null

function loadWriter(): Promise<Writer> {
  writer ??= import('zxing-wasm/writer').then((w) => {
    w.prepareZXingModule({
      overrides: {
        locateFile: (path: string, prefix: string) =>
          path.endsWith('.wasm') ? `/wasm/${path}` : prefix + path,
      },
    })
    return w
  })
  return writer
}

export type MatrixOptions = { rectangular?: boolean }

/** The module grid for a value (0 = dark), without quiet zones; throws with zint's message on failure. */
export async function matrixGrid(
  type: MatrixType,
  value: string,
  options: MatrixOptions = {},
): Promise<ModuleGrid> {
  const { writeBarcode } = await loadWriter()
  const r = await writeBarcode(value, {
    format: MATRIX_FORMAT[type],
    options: type === 'datamatrix' && !options.rectangular ? 'forceSquare' : '',
    scale: 1,
    addQuietZones: false,
  })
  if (r.error || !r.symbol) throw new Error(r.error || 'Could not make this code.')
  return r.symbol
}
