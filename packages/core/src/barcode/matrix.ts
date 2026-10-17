/**
 * 2D barcodes (Data Matrix, PDF417, Aztec). The module grid comes from the zxing writer (zint),
 * which runs in the browser; this file checks the input and draws the grid as a scene, so every
 * download format matches the preview, as with QR codes and linear barcodes.
 */
import { fmt } from '../qr/path'
import type { Scene, SceneItem } from '../qr/scene'

export const MATRIX_TYPES = ['datamatrix', 'pdf417', 'aztec'] as const
export type MatrixType = (typeof MATRIX_TYPES)[number]

export function isMatrixType(v: unknown): v is MatrixType {
  return (MATRIX_TYPES as readonly unknown[]).includes(v)
}

/** zxing format names, for the writer and the scan check. */
export const MATRIX_FORMAT: Record<MatrixType, 'DataMatrix' | 'PDF417' | 'Aztec'> = {
  datamatrix: 'DataMatrix',
  pdf417: 'PDF417',
  aztec: 'Aztec',
}

/** Blank margin in modules. Data Matrix needs 1, PDF417 2, Aztec none; 2 is comfortable for all. */
export const MATRIX_QUIET: Record<MatrixType, number> = { datamatrix: 2, pdf417: 2, aztec: 2 }

/** Generous limits below each symbology's capacity, so codes stay a printable size. */
const MAX_LENGTH: Record<MatrixType, number> = { datamatrix: 1000, pdf417: 800, aztec: 1500 }

export function checkMatrixValue(
  type: MatrixType,
  input: string,
): { ok: true; value: string } | { ok: false; error: string } {
  if (!input) return { ok: false, error: 'Enter the text or number to encode.' }
  if (input.length > MAX_LENGTH[type])
    return { ok: false, error: `Keep it to ${MAX_LENGTH[type].toLocaleString('en')} characters.` }
  // Control characters other than line breaks and tabs rarely mean what people expect.
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(input))
    return { ok: false, error: 'Remove hidden control characters from the text.' }
  return { ok: true, value: input }
}

/** A grid as the zxing writer returns it: one byte per module, 0 = dark. */
export type ModuleGrid = { width: number; height: number; data: ArrayLike<number> }

export type MatrixStyle = { foreground: string; background: string; transparent: boolean }

/** Draws a module grid with a quiet zone, merging each row's dark runs into rectangles. */
export function matrixScene(grid: ModuleGrid, style: MatrixStyle, quiet: number): Scene {
  const width = grid.width + quiet * 2
  const height = grid.height + quiet * 2
  let d = ''
  for (let y = 0; y < grid.height; y++) {
    let x = 0
    while (x < grid.width) {
      if (grid.data[y * grid.width + x] !== 0) {
        x++
        continue
      }
      let end = x
      while (end < grid.width && grid.data[y * grid.width + end] === 0) end++
      const x0 = quiet + x
      const y0 = quiet + y
      d += `M${fmt(x0)} ${fmt(y0)}H${fmt(quiet + end)}V${fmt(y0 + 1)}H${fmt(x0)}Z`
      x = end
    }
  }
  const items: SceneItem[] = []
  if (!style.transparent)
    items.push({
      kind: 'path',
      d: `M0 0H${width}V${height}H0Z`,
      fill: { type: 'solid', color: style.background },
    })
  items.push({ kind: 'path', d, fill: { type: 'solid', color: style.foreground } })
  return { width, height, items }
}
