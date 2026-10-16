'use client'

import {
  DEFAULT_DESIGN,
  DEFAULT_FIELDS,
  DYNAMIC_TYPES,
  type ContentFields,
  type ContentType,
  type Design,
} from '@qrfinity/core'
import { create } from 'zustand'

export const DEFAULT_PRINT_WIDTH_MM = 40

export type CodeKind = 'static' | 'dynamic'

export { DYNAMIC_TYPES }

export type GeneratorInit = {
  kind?: CodeKind
  type?: ContentType
  fields?: Partial<ContentFields>
  design?: Design
}

export type GeneratorState = {
  kind: CodeKind
  type: ContentType
  fields: ContentFields
  design: Design
  printWidthMm: number
  setKind: (kind: CodeKind) => void
  setType: (type: ContentType) => void
  setFields: <K extends ContentType>(type: K, patch: Partial<ContentFields[K]>) => void
  setDesign: (patch: Partial<Design>) => void
  setFrame: (patch: Partial<Design['frame']>) => void
  replaceDesign: (design: Design) => void
  resetDesign: () => void
  setPrintWidthMm: (mm: number) => void
}

export const createGeneratorStore = (init: GeneratorInit = {}) =>
  create<GeneratorState>()((set) => ({
    kind: init.kind ?? 'static',
    type: init.type ?? 'url',
    fields: { ...DEFAULT_FIELDS, ...init.fields },
    design: init.design ?? DEFAULT_DESIGN,
    printWidthMm: DEFAULT_PRINT_WIDTH_MM,
    setKind: (kind) =>
      set((s) => ({
        kind,
        type: kind === 'dynamic' && !DYNAMIC_TYPES.includes(s.type) ? 'url' : s.type,
      })),
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
