'use client'

import {
  DEFAULT_BAR_HEIGHT,
  DEFAULT_HEIGHT_MM,
  MATRIX_QUIET,
  NOMINAL_WIDTH_MM,
  checkBarcodeValue,
  checkMatrixValue,
  isMatrixType,
  matrixScene,
  renderBarcode,
} from '@qrfinity/core'
import type { BarcodeJob } from './barcode-export'
import { matrixGrid } from './barcode2d'
import type { AnyBarcode } from './barcodes'

export type BuildOptions = {
  /** Printed width in mm, quiet zones included; the type's standard or 0.33 mm per module when unset. */
  widthMm?: number | null
  /** Bar height in mm (linear barcodes). */
  heightMm?: number | null
  showText: boolean
  foreground: string
  background: string
  transparent: boolean
  addon?: string
  rectangular?: boolean
}

const MODULE_MM = 0.33
const MODULE_2D_MM = { datamatrix: 0.5, aztec: 0.5, pdf417: 0.33 } as const

/** Checks a value and draws it, the same way as the single barcode generator. */
export async function buildBarcode(
  type: AnyBarcode,
  input: string,
  o: BuildOptions,
  baseName: string,
): Promise<{ ok: true; value: string; job: BarcodeJob } | { ok: false; error: string }> {
  const matte = o.transparent ? '#ffffff' : o.background
  if (isMatrixType(type)) {
    const checked = checkMatrixValue(type, input)
    if (!checked.ok) return checked
    try {
      const grid = await matrixGrid(type, checked.value, { rectangular: o.rectangular })
      const scene = matrixScene(
        grid,
        { foreground: o.foreground, background: o.background, transparent: o.transparent },
        MATRIX_QUIET[type],
      )
      const widthMm = o.widthMm ?? Math.round(scene.width * MODULE_2D_MM[type] * 10) / 10
      return { ok: true, value: checked.value, job: { scene, widthMm, matte, baseName } }
    } catch {
      return { ok: false, error: 'This is more than the code can hold. Shorten the text.' }
    }
  }
  const checked = checkBarcodeValue(type, input)
  if (!checked.ok) return checked
  const style = (barHeight: number) => ({
    barHeight,
    showText: o.showText,
    foreground: o.foreground,
    background: o.background,
    transparent: o.transparent,
  })
  const first = renderBarcode(
    type,
    checked.value,
    style(DEFAULT_BAR_HEIGHT[type]),
    checked.above,
    o.addon,
  )
  const widthMm =
    o.widthMm ?? NOMINAL_WIDTH_MM[type] ?? Math.round(first.scene.width * MODULE_MM * 10) / 10
  const moduleMm = widthMm / first.scene.width
  const heightMm = o.heightMm ?? DEFAULT_HEIGHT_MM[type]
  const { scene } = renderBarcode(
    type,
    checked.value,
    style(Math.max(5, heightMm / moduleMm)),
    checked.above,
    o.addon,
  )
  return { ok: true, value: checked.value, job: { scene, widthMm, matte, baseName } }
}
