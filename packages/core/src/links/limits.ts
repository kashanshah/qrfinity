/**
 * Date and scan limits (an advanced feature): after a date and time, or once a code has been
 * scanned a set number of times, scans go to another page the owner chose (an "offer ended" page,
 * next year's event). The code itself never stops working. The date switch is exact (the Worker
 * checks the clock); the scan count is checked every few minutes, so a few extra scans can get
 * through before the switch.
 */
import { isValidTimeZone, localTime } from './rules'

/** As stored with a code. */
export type CodeLimits = {
  /** Where scans go once a limit is reached. */
  dest: string
  /** The date limit as the owner entered it, in their time zone… */
  date?: string
  time?: string
  timezone?: string
  /** …and the same moment in UTC (ISO), which is what the Worker compares against. */
  at?: string
  /** Switch after this many scans, counted from `since`. */
  scans?: number
  /** When the scan count started (ISO): when the scan limit was set. */
  since: string
  /** When the scan limit was found reached (ISO). Set by the scan-limit check. */
  reachedAt?: string
}

/** What the Worker needs: from `at` on, scans go to `dest`. */
export type LinkLimit = { at: string; dest: string }

export const MAX_SCAN_LIMIT = 10_000_000

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

/** The UTC moment of a local date and time in a time zone (handles daylight saving). */
export function zonedTimeToUtc(date: string, time: string, timezone: string): Date {
  const [y, mo, d] = date.split('-').map(Number) as [number, number, number]
  const [h, mi] = time.split(':').map(Number) as [number, number]
  const wanted = Date.UTC(y, mo - 1, d, h, mi)
  let guess = wanted
  // Two passes settle the offset, including on the day the clocks change.
  for (let i = 0; i < 2; i++) {
    const t = localTime(new Date(guess), timezone)
    const [ly, lmo, ld] = t.date.split('-').map(Number) as [number, number, number]
    const [lh, lmi] = t.time.split(':').map(Number) as [number, number]
    guess += wanted - Date.UTC(ly, lmo - 1, ld, lh, lmi)
  }
  return new Date(guess)
}

export type LimitsInput = {
  dest?: unknown
  date?: unknown
  time?: unknown
  timezone?: unknown
  scans?: unknown
}

/**
 * Checks what the owner entered. `previous` keeps the scan count running when only the date or the
 * page changes; a new or changed scan limit starts counting from `now`.
 */
export function validateLimits(
  input: LimitsInput,
  checkDest: (url: string) => { ok: true; url: string } | { ok: false; message: string },
  { now, previous }: { now: Date; previous?: CodeLimits | null },
): { ok: true; limits: CodeLimits } | { ok: false; error: string } {
  const hasDate = typeof input.date === 'string' && input.date !== ''
  const hasScans = input.scans !== undefined && input.scans !== null && input.scans !== ''
  if (!hasDate && !hasScans) return { ok: false, error: 'Set a date, a number of scans, or both.' }

  const out: Partial<CodeLimits> = {}
  if (hasDate) {
    if (!DATE.test(input.date as string)) return { ok: false, error: 'Enter a valid date.' }
    const time = typeof input.time === 'string' && input.time ? input.time : '00:00'
    if (!TIME.test(time)) return { ok: false, error: 'Enter a valid time.' }
    if (typeof input.timezone !== 'string' || !isValidTimeZone(input.timezone))
      return { ok: false, error: 'Choose a time zone.' }
    out.date = input.date as string
    out.time = time
    out.timezone = input.timezone
    out.at = zonedTimeToUtc(out.date, time, input.timezone).toISOString()
  }
  if (hasScans) {
    const n = Number(input.scans)
    if (!Number.isInteger(n) || n < 1 || n > MAX_SCAN_LIMIT)
      return {
        ok: false,
        error: `Enter a whole number of scans from 1 to ${MAX_SCAN_LIMIT.toLocaleString('en')}.`,
      }
    out.scans = n
  }
  if (typeof input.dest !== 'string' || !input.dest.trim())
    return { ok: false, error: 'Enter where scans go after the limit.' }
  const dest = checkDest(input.dest)
  if (!dest.ok) return { ok: false, error: dest.message }

  // Same scan limit as before: keep counting (and keep it reached if it was).
  const sameCount = previous?.scans !== undefined && previous.scans === out.scans
  return {
    ok: true,
    limits: {
      dest: dest.url,
      ...out,
      since: sameCount ? previous!.since : now.toISOString(),
      ...(sameCount && previous!.reachedAt ? { reachedAt: previous!.reachedAt } : {}),
    },
  }
}

/** The switch the Worker applies: the earlier of the date limit and the moment the scan limit was reached. */
export function limitSwitch(value: unknown): LinkLimit | undefined {
  if (!value || typeof value !== 'object') return undefined
  const l = value as Record<string, unknown>
  if (typeof l.dest !== 'string' || !/^https?:\/\//i.test(l.dest)) return undefined
  const times = [l.at, l.reachedAt]
    .filter((t): t is string => typeof t === 'string' && !Number.isNaN(Date.parse(t)))
    .sort((a, b) => Date.parse(a) - Date.parse(b))
  return times[0] ? { at: new Date(times[0]).toISOString(), dest: l.dest } : undefined
}

/** Lenient parse of an edge record's limit. */
export function parseLinkLimit(value: unknown): LinkLimit | undefined {
  if (!value || typeof value !== 'object') return undefined
  const l = value as Record<string, unknown>
  if (typeof l.dest !== 'string' || !/^https?:\/\//i.test(l.dest)) return undefined
  if (typeof l.at !== 'string' || Number.isNaN(Date.parse(l.at))) return undefined
  return { at: l.at, dest: l.dest }
}

/** True once the switch applies. */
export const limitReached = (limit: LinkLimit | undefined, now: Date) =>
  limit !== undefined && now.getTime() >= Date.parse(limit.at)

/** The label recorded with scans sent by a limit. */
export const LIMIT_LABEL = 'After the limit'
