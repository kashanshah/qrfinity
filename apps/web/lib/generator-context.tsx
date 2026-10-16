'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import { useStore } from 'zustand'
import {
  createGeneratorStore,
  type GeneratorInit,
  type GeneratorState,
  type GeneratorStore,
} from './store'

const Ctx = createContext<GeneratorStore | null>(null)

/** One store per generator, so pages can preload a content type, a draft or a saved code. */
export function GeneratorProvider({
  init,
  children,
}: {
  init?: GeneratorInit
  children: ReactNode
}) {
  const [store] = useState(() => createGeneratorStore(init))
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}

export function useGenerator<T>(selector: (s: GeneratorState) => T): T {
  const store = useContext(Ctx)
  if (!store) throw new Error('useGenerator must be used inside <GeneratorProvider>')
  return useStore(store, selector)
}
