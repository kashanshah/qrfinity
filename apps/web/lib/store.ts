'use client'

import {
  DEFAULT_DESIGN,
  DEFAULT_FIELDS,
  type ContentFields,
  type ContentType,
  type Design,
} from '@qrfinity/core'
import { create } from 'zustand'

export const DEFAULT_PRINT_WIDTH_MM = 40

export type GeneratorState = {
  type: ContentType
  fields: ContentFields
  design: Design
  printWidthMm: number
  setType: (type: ContentType) => void
  setFields: <K extends ContentType>(type: K, patch: Partial<ContentFields[K]>) => void
  setDesign: (patch: Partial<Design>) => void
  setFrame: (patch: Partial<Design['frame']>) => void
  replaceDesign: (design: Design) => void
  resetDesign: () => void
  setPrintWidthMm: (mm: number) => void
}

export const createGeneratorStore = (initialType: ContentType = 'url') =>
  create<GeneratorState>()((set) => ({
    type: initialType,
    fields: DEFAULT_FIELDS,
    design: DEFAULT_DESIGN,
    printWidthMm: DEFAULT_PRINT_WIDTH_MM,
    setType: (type) => set({ type }),
    setFields: (type, patch) =>
      set((s) => ({ fields: { ...s.fields, [type]: { ...s.fields[type], ...patch } } })),
    setDesign: (patch) => set((s) => ({ design: { ...s.design, ...patch } })),
    setFrame: (patch) =>
      set((s) => ({ design: { ...s.design, frame: { ...s.design.frame, ...patch } } })),
    replaceDesign: (design) => set({ design }),
    resetDesign: () => set({ design: DEFAULT_DESIGN }),
    setPrintWidthMm: (printWidthMm) => set({ printWidthMm }),
  }))

export type GeneratorStore = ReturnType<typeof createGeneratorStore>
