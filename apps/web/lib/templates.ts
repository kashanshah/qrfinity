import type { Design } from '@qrfinity/core'
import { useSyncExternalStore } from 'react'

export type Template = { id: string; name: string; design: Design; savedAt: number }

const KEY = 'qrfinity.templates.v1'
const EMPTY: Template[] = []
let cache: Template[] | null = null
const listeners = new Set<() => void>()

/** Saved designs live in this browser only (localStorage). Accounts will sync them later. */
function read(): Template[] {
  if (cache) return cache
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    cache = Array.isArray(parsed) ? (parsed as Template[]) : EMPTY
  } catch {
    cache = EMPTY
  }
  return cache
}

/** Returns false when the browser refuses to store it (private mode or out of space). */
export function saveTemplates(templates: Template[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(templates))
  } catch {
    return false
  }
  cache = templates
  listeners.forEach((l) => l())
  return true
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useTemplates(): Template[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY)
}
