/**
 * Split traffic (an advanced feature): share scans between the main destination and up to four
 * other versions by percentage, to compare them (an A/B test). Applies to scans no redirect rule
 * catches. Each scan picks at random; nothing is stored on the visitor's phone, so someone who
 * scans twice may see different versions. Shared by the web app (validation) and the Worker.
 */

export type SplitVariant = {
  /** Optional label shown in analytics; "Version B", "Version C"… when empty. */
  name: string
  dest: string
  /** Share of scans, 1–99. The main destination gets what's left. */
  percent: number
}

export type Split = { variants: SplitVariant[] }

export const MAX_VARIANTS = 4
const NAME_MAX = 60
const LETTERS = 'ABCDE'

/** The label for the main destination's share. */
export const MAIN_VERSION_LABEL = 'Version A'

export const variantLabel = (v: SplitVariant, index: number) =>
  (v.name || `Version ${LETTERS[index + 1]}`).slice(0, NAME_MAX)

/** The main destination's share. */
export const mainPercent = (split: Split) =>
  100 - split.variants.reduce((sum, v) => sum + v.percent, 0)

function shapeError(v: Record<string, unknown>): string | null {
  if (typeof v.percent !== 'number' || !Number.isInteger(v.percent) || v.percent < 1)
    return 'give it a whole-number share of at least 1%.'
  if (v.percent > 99) return 'its share must be under 100%.'
  return null
}

/**
 * Validates a split. An empty list removes it. `checkDest` validates and normalizes a destination
 * (the same check the main destination gets).
 */
export function validateSplit(
  input: unknown,
  checkDest: (url: string) => { ok: true; url: string } | { ok: false; message: string },
): { ok: true; split: Split | null } | { ok: false; error: string } {
  const list = Array.isArray(input)
    ? input
    : input && typeof input === 'object'
      ? (input as { variants?: unknown }).variants
      : undefined
  if (!Array.isArray(list)) return { ok: false, error: 'Versions must be a list.' }
  if (!list.length) return { ok: true, split: null }
  if (list.length > MAX_VARIANTS)
    return { ok: false, error: `A code can have up to ${MAX_VARIANTS + 1} versions.` }
  const variants: SplitVariant[] = []
  for (const [i, raw] of list.entries()) {
    const label = `Version ${LETTERS[i + 1]}`
    const v = (raw ?? {}) as Record<string, unknown>
    const err = shapeError(v)
    if (err) return { ok: false, error: `${label}: ${err}` }
    if (typeof v.dest !== 'string' || !v.dest.trim())
      return { ok: false, error: `${label}: enter where it sends people.` }
    const dest = checkDest(v.dest)
    if (!dest.ok) return { ok: false, error: `${label}: ${dest.message}` }
    const name = typeof v.name === 'string' ? v.name.trim().slice(0, NAME_MAX) : ''
    variants.push({ name, dest: dest.url, percent: v.percent as number })
  }
  const split = { variants }
  if (mainPercent(split) < 1)
    return {
      ok: false,
      error: 'The shares add up to 100% or more. Leave at least 1% for the main destination.',
    }
  return { ok: true, split }
}

/** Lenient parse for the Worker: anything malformed means no split (scans use the main destination). */
export function parseSplit(value: unknown): Split | undefined {
  if (!value || typeof value !== 'object') return undefined
  const list = (value as { variants?: unknown }).variants
  if (!Array.isArray(list) || !list.length || list.length > MAX_VARIANTS) return undefined
  const variants: SplitVariant[] = []
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') return undefined
    const v = raw as Record<string, unknown>
    if (shapeError(v) || typeof v.dest !== 'string' || !/^https?:\/\//i.test(v.dest))
      return undefined
    variants.push({
      name: typeof v.name === 'string' ? v.name : '',
      dest: v.dest,
      percent: v.percent as number,
    })
  }
  const split = { variants }
  return mainPercent(split) >= 1 ? split : undefined
}

/**
 * Picks a version for one scan. `roll` is a random number in [0, 1). Returns the destination and
 * the label to record.
 */
export function pickVersion(
  main: string,
  split: Split | undefined,
  roll: number,
): { dest: string; label: string } {
  if (!split) return { dest: main, label: '' }
  let point = roll * 100
  for (const [i, v] of split.variants.entries()) {
    if (point < v.percent) return { dest: v.dest, label: variantLabel(v, i) }
    point -= v.percent
  }
  return { dest: main, label: MAIN_VERSION_LABEL }
}
