import type { GeneratorInit } from './store'

const KEY = 'qrfinity.draft.v1'
const MAX_AGE_MS = 60 * 60 * 1000

/** Carries a dynamic code being designed on the homepage through sign-in to the create page. */
export function saveDraft(draft: GeneratorInit) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now(), draft }))
  } catch {
    // Private mode or storage full: the create page starts fresh.
  }
}

/** Reads without removing, so a remount still finds it. Cleared once the code is created. */
export function readDraft(): GeneratorInit | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const { at, draft } = JSON.parse(raw) as { at: number; draft: GeneratorInit }
    return Date.now() - at < MAX_AGE_MS ? draft : null
  } catch {
    return null
  }
}

export function clearDraft() {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // Nothing to clear.
  }
}
