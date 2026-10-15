'use client'

import type { ContentType } from '@qrfinity/core'
import { createContext, useContext, useState, type ReactNode } from 'react'
import { useStore } from 'zustand'
import { createGeneratorStore, type GeneratorState, type GeneratorStore } from './store'

const Ctx = createContext<GeneratorStore | null>(null)

/** One store per generator, so use-case pages can preload a content type. */
export function GeneratorProvider({
  initialType,
  children,
}: {
  initialType?: ContentType
  children: ReactNode
}) {
  const [store] = useState(() => createGeneratorStore(initialType))
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}

export function useGenerator<T>(selector: (s: GeneratorState) => T): T {
  const store = useContext(Ctx)
  if (!store) throw new Error('useGenerator must be used inside <GeneratorProvider>')
  return useStore(store, selector)
}
