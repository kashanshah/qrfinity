/**
 * Redirect rules (an advanced feature): send a scan somewhere other than the main destination
 * depending on the phone, the country or the time. Rules are checked in order and the first match
 * wins; when none matches, the main destination is used. Shared by the web app (validation) and
 * the redirect Worker (matching), so it uses nothing beyond the standard library.
 */

export const RULE_DEVICES = ['ios', 'android', 'other'] as const
export type RuleDevice = (typeof RULE_DEVICES)[number]

export type RuleCondition =
  /** iPhone/iPad, Android, or everything else (computers, other phones). */
  | { type: 'device'; devices: RuleDevice[] }
  /** ISO 3166-1 alpha-2 codes, as Cloudflare reports them (e.g. CA, US). */
  | { type: 'country'; countries: string[] }
  /** Days of the week (0 = Sunday) and a time window, in the owner's time zone. `to` before `from` crosses midnight. */
  | { type: 'schedule'; timezone: string; days: number[]; from: string; to: string }
  /** A date range, both days included, in the owner's time zone. */
  | { type: 'dates'; timezone: string; start: string; end: string }

export type RedirectRule = {
  /** Optional label shown in analytics; a description is used when empty. */
  name: string
  when: RuleCondition
  dest: string
}

export const MAX_RULES = 10
const NAME_MAX = 60

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz })
    return tz.length <= 64
  } catch {
    return false
  }
}

/** Checks one condition's shape. Returns an error message for people, or null when valid. */
export function conditionError(c: unknown): string | null {
  if (!c || typeof c !== 'object') return 'Choose when the rule applies.'
  const r = c as Record<string, unknown>
  switch (r.type) {
    case 'device': {
      const d = r.devices
      if (!Array.isArray(d) || !d.length || !d.every((x) => RULE_DEVICES.includes(x)))
        return 'Choose at least one kind of phone.'
      return null
    }
    case 'country': {
      const list = r.countries
      if (!Array.isArray(list) || !list.length) return 'Choose at least one country.'
      if (list.length > 250 || !list.every((x) => typeof x === 'string' && /^[A-Z]{2}$/.test(x)))
        return 'Countries must be two-letter codes, like CA or US.'
      return null
    }
    case 'schedule': {
      if (typeof r.timezone !== 'string' || !isValidTimeZone(r.timezone))
        return 'Choose a time zone.'
      const days = r.days
      if (
        !Array.isArray(days) ||
        !days.length ||
        !days.every((x) => Number.isInteger(x) && x >= 0 && x <= 6)
      )
        return 'Choose at least one day.'
      if (typeof r.from !== 'string' || !TIME.test(r.from)) return 'Enter a start time.'
      if (typeof r.to !== 'string' || !TIME.test(r.to)) return 'Enter an end time.'
      if (r.from === r.to) return 'The start and end times must be different.'
      return null
    }
    case 'dates': {
      if (typeof r.timezone !== 'string' || !isValidTimeZone(r.timezone))
        return 'Choose a time zone.'
      if (typeof r.start !== 'string' || !DATE.test(r.start)) return 'Enter a start date.'
      if (typeof r.end !== 'string' || !DATE.test(r.end)) return 'Enter an end date.'
      if (r.end < r.start) return 'The end date is before the start date.'
      return null
    }
    default:
      return 'Choose when the rule applies.'
  }
}

/** Keeps only known fields, deduplicated and sorted, so stored rules are tidy. */
export function cleanCondition(c: RuleCondition): RuleCondition {
  switch (c.type) {
    case 'device':
      return { type: 'device', devices: RULE_DEVICES.filter((d) => c.devices.includes(d)) }
    case 'country':
      return { type: 'country', countries: [...new Set(c.countries)].sort() }
    case 'schedule':
      return {
        type: 'schedule',
        timezone: c.timezone,
        days: [...new Set(c.days)].sort(),
        from: c.from,
        to: c.to,
      }
    case 'dates':
      return { type: 'dates', timezone: c.timezone, start: c.start, end: c.end }
  }
}

/**
 * Validates a whole rule list. `checkDest` validates and normalizes a destination (the same check
 * the main destination gets) and returns an error message or the cleaned URL.
 */
export function validateRules(
  input: unknown,
  checkDest: (url: string) => { ok: true; url: string } | { ok: false; message: string },
): { ok: true; rules: RedirectRule[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: 'Rules must be a list.' }
  if (input.length > MAX_RULES)
    return { ok: false, error: `A code can have up to ${MAX_RULES} rules.` }
  const rules: RedirectRule[] = []
  for (const [i, raw] of input.entries()) {
    const n = i + 1
    const r = (raw ?? {}) as Record<string, unknown>
    const err = conditionError(r.when)
    if (err) return { ok: false, error: `Rule ${n}: ${err}` }
    if (typeof r.dest !== 'string' || !r.dest.trim())
      return { ok: false, error: `Rule ${n}: enter where it sends people.` }
    const dest = checkDest(r.dest)
    if (!dest.ok) return { ok: false, error: `Rule ${n}: ${dest.message}` }
    const name = typeof r.name === 'string' ? r.name.trim().slice(0, NAME_MAX) : ''
    rules.push({ name, when: cleanCondition(r.when as RuleCondition), dest: dest.url })
  }
  return { ok: true, rules }
}

const DEVICE_LABEL: Record<RuleDevice, string> = {
  ios: 'iPhone and iPad',
  android: 'Android',
  other: 'Other devices',
}
const DAY_LABEL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function dayList(days: number[]): string {
  const key = [...days].sort().join(',')
  if (key === '0,1,2,3,4,5,6') return 'Every day'
  if (key === '1,2,3,4,5') return 'Weekdays'
  if (key === '0,6') return 'Weekends'
  return [...days]
    .sort()
    .map((d) => DAY_LABEL[d])
    .join(', ')
}

/** A short plain-words description, e.g. "Weekdays 11:00–15:00". */
export function describeCondition(c: RuleCondition): string {
  switch (c.type) {
    case 'device':
      return c.devices.map((d) => DEVICE_LABEL[d]).join(', ')
    case 'country':
      return c.countries.length <= 4
        ? c.countries.join(', ')
        : `${c.countries.slice(0, 3).join(', ')} and ${c.countries.length - 3} more`
    case 'schedule':
      return `${dayList(c.days)} ${c.from}–${c.to}`
    case 'dates':
      return c.start === c.end ? c.start : `${c.start} to ${c.end}`
  }
}

/** The label recorded with each scan a rule sends: its name, or its description. */
export function ruleLabel(rule: RedirectRule): string {
  return (rule.name || describeCondition(rule.when)).slice(0, NAME_MAX)
}

/** What the redirect knows about a scan. */
export type ScanFacts = { os: string; country: string; now: Date }

export function deviceOf(os: string): RuleDevice {
  return os === 'iOS' ? 'ios' : os === 'Android' ? 'android' : 'other'
}

/** Local weekday (0 = Sunday), "HH:MM" and "YYYY-MM-DD" in a time zone. */
export function localTime(now: Date, timezone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  )
  return {
    day: DAY_LABEL.indexOf(parts.weekday ?? ''),
    time: `${parts.hour}:${parts.minute}`,
    date: `${parts.year}-${parts.month}-${parts.day}`,
  }
}

export function matches(c: RuleCondition, facts: ScanFacts): boolean {
  switch (c.type) {
    case 'device':
      return c.devices.includes(deviceOf(facts.os))
    case 'country':
      return c.countries.includes(facts.country.toUpperCase())
    case 'schedule': {
      const t = localTime(facts.now, c.timezone)
      if (c.from < c.to) return c.days.includes(t.day) && t.time >= c.from && t.time < c.to
      // Crosses midnight: e.g. Fri 22:00–02:00 covers Friday night and early Saturday.
      if (t.time >= c.from) return c.days.includes(t.day)
      return t.time < c.to && c.days.includes((t.day + 6) % 7)
    }
    case 'dates': {
      const { date } = localTime(facts.now, c.timezone)
      return date >= c.start && date <= c.end
    }
  }
}

/** The destination for a scan and the rule label to record ('' for the main destination). */
export function pickDestination(
  main: string,
  rules: readonly RedirectRule[] | undefined,
  facts: ScanFacts,
): { dest: string; rule: string } {
  for (const r of rules ?? []) {
    try {
      if (matches(r.when, facts)) return { dest: r.dest, rule: ruleLabel(r) }
    } catch {
      // A rule that can't be evaluated (e.g. a time zone the runtime doesn't know) is skipped.
    }
  }
  return { dest: main, rule: '' }
}

/** Lenient parse for the redirect Worker: drops anything malformed instead of failing the scan. */
export function parseRules(value: unknown): RedirectRule[] | undefined {
  if (!Array.isArray(value)) return undefined
  const out: RedirectRule[] = []
  for (const r of value.slice(0, MAX_RULES)) {
    if (!r || typeof r !== 'object') continue
    const { name, when, dest } = r as Record<string, unknown>
    if (typeof dest !== 'string' || !/^https?:\/\//i.test(dest)) continue
    if (conditionError(when)) continue
    out.push({ name: typeof name === 'string' ? name : '', when: when as RuleCondition, dest })
  }
  return out.length ? out : undefined
}
