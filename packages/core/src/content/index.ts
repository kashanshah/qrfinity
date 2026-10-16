/**
 * Content types and their encoders: each turns form fields into the exact
 * string stored in a static QR code. Validation messages are user-facing copy.
 */

export const CONTENT_TYPES = [
  'url',
  'text',
  'wifi',
  'vcard',
  'email',
  'sms',
  'phone',
  'whatsapp',
  'location',
  'event',
  'app',
  'social',
] as const

export type ContentType = (typeof CONTENT_TYPES)[number]

/** Content types a dynamic code can hold: they all resolve to an http(s) address. */
export const DYNAMIC_TYPES: readonly ContentType[] = [
  'url',
  'whatsapp',
  'location',
  'app',
  'social',
]

export type UrlFields = { url: string }
export type TextFields = { text: string }
export type WifiFields = {
  ssid: string
  password: string
  encryption: 'WPA' | 'WEP' | 'nopass'
  hidden: boolean
}
export type VcardFields = {
  firstName: string
  lastName: string
  organization: string
  title: string
  mobile: string
  workPhone: string
  email: string
  website: string
  street: string
  city: string
  region: string
  postalCode: string
  country: string
  note: string
}
export type EmailFields = { to: string; subject: string; body: string }
export type SmsFields = { phone: string; message: string }
export type PhoneFields = { phone: string }
export type WhatsappFields = { phone: string; message: string }
export type LocationFields = {
  mode: 'address' | 'coordinates'
  address: string
  latitude: string
  longitude: string
  /**
   * Google place ID from an address suggestion, so Maps opens that exact place rather than the
   * best match for the text. Empty when the address was typed by hand.
   */
  placeId?: string
}
export type EventFields = {
  title: string
  allDay: boolean
  /** `YYYY-MM-DDTHH:mm` (or `YYYY-MM-DD` when all day), local time at the venue. */
  start: string
  end: string
  location: string
  description: string
}
export type AppFields = { store: 'ios' | 'android'; url: string }
export const SOCIAL_PLATFORMS = [
  'instagram',
  'facebook',
  'x',
  'tiktok',
  'linkedin',
  'youtube',
  'threads',
  'pinterest',
] as const
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number]
export type SocialFields = { platform: SocialPlatform; handle: string }

export type ContentFields = {
  url: UrlFields
  text: TextFields
  wifi: WifiFields
  vcard: VcardFields
  email: EmailFields
  sms: SmsFields
  phone: PhoneFields
  whatsapp: WhatsappFields
  location: LocationFields
  event: EventFields
  app: AppFields
  social: SocialFields
}

export type FieldErrors = Record<string, string>

/**
 * `empty`: required fields are blank (show a prompt, not an error).
 * `invalid`: something is filled in wrongly; `errors` maps field → message.
 */
export type EncodeResult =
  { ok: true; payload: string } | { ok: false; reason: 'empty' | 'invalid'; errors: FieldErrors }

export const DEFAULT_FIELDS: ContentFields = {
  url: { url: 'https://qrfinity.com' },
  text: { text: '' },
  wifi: { ssid: '', password: '', encryption: 'WPA', hidden: false },
  vcard: {
    firstName: '',
    lastName: '',
    organization: '',
    title: '',
    mobile: '',
    workPhone: '',
    email: '',
    website: '',
    street: '',
    city: '',
    region: '',
    postalCode: '',
    country: '',
    note: '',
  },
  email: { to: '', subject: '', body: '' },
  sms: { phone: '', message: '' },
  phone: { phone: '' },
  whatsapp: { phone: '', message: '' },
  location: { mode: 'address', address: '', latitude: '', longitude: '', placeId: '' },
  event: { title: '', allDay: false, start: '', end: '', location: '', description: '' },
  app: { store: 'ios', url: '' },
  social: { platform: 'instagram', handle: '' },
}

const ok = (payload: string): EncodeResult => ({ ok: true, payload })
const empty = (errors: FieldErrors = {}): EncodeResult => ({ ok: false, reason: 'empty', errors })
const invalid = (errors: FieldErrors): EncodeResult => ({ ok: false, reason: 'invalid', errors })

// ---------------------------------------------------------------------------
// Shared validators

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim())
}

/**
 * Normalises a web address: trims, adds https:// when no scheme is given,
 * and accepts only http(s) URLs with a dotted host name.
 */
export function normalizeWebUrl(input: string): string | null {
  let value = input.trim()
  if (!value) return null
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) value = 'https://' + value
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
  const host = parsed.hostname
  if (!host.includes('.') || host.startsWith('.') || host.endsWith('.')) return null
  if (/\s/.test(value)) return null
  // Keep what the person typed (URL.toString() would add a trailing slash).
  return value
}

/** Keeps a leading + and digits; strips spaces, dashes, dots and brackets. */
export function normalizePhone(input: string): string {
  const trimmed = input.trim()
  const plus = trimmed.startsWith('+') ? '+' : ''
  return plus + trimmed.replace(/[^\d]/g, '')
}

function isValidPhone(normalized: string): boolean {
  const digits = normalized.replace('+', '')
  return digits.length >= 3 && digits.length <= 17
}

// ---------------------------------------------------------------------------
// Escaping

/** Wi-Fi QR format escapes \ ; , : and " with a backslash. */
export function escapeWifi(value: string): string {
  return value.replace(/([\\;,:"])/g, '\\$1')
}

/** vCard 3.0 / iCalendar text escaping. */
export function escapeVText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
}

// ---------------------------------------------------------------------------
// Encoders

function encodeUrl(f: UrlFields): EncodeResult {
  if (!f.url.trim()) return empty()
  const url = normalizeWebUrl(f.url)
  if (!url) return invalid({ url: 'Enter a full web address, like example.com/menu.' })
  return ok(url)
}

function encodeText(f: TextFields): EncodeResult {
  if (!f.text.trim()) return empty()
  return ok(f.text)
}

function encodeWifi(f: WifiFields): EncodeResult {
  if (!f.ssid.trim()) return empty()
  if (f.encryption !== 'nopass' && !f.password) {
    return invalid({ password: 'Enter the Wi-Fi password, or choose "No password".' })
  }
  if (f.encryption === 'WPA' && f.password.length < 8) {
    return invalid({ password: 'WPA passwords are at least 8 characters.' })
  }
  let s = `WIFI:T:${f.encryption};S:${escapeWifi(f.ssid)};`
  if (f.encryption !== 'nopass') s += `P:${escapeWifi(f.password)};`
  if (f.hidden) s += 'H:true;'
  return ok(s + ';')
}

function encodeVcard(f: VcardFields): EncodeResult {
  const hasName = f.firstName.trim() || f.lastName.trim() || f.organization.trim()
  if (!hasName) return empty()
  const errors: FieldErrors = {}
  if (f.email.trim() && !isValidEmail(f.email)) errors.email = 'Check the email address.'
  let website = ''
  if (f.website.trim()) {
    website = normalizeWebUrl(f.website) ?? ''
    if (!website) errors.website = 'Enter a full web address, like example.com.'
  }
  if (Object.keys(errors).length) return invalid(errors)

  const e = (v: string) => escapeVText(v.trim())
  const fullName = [f.firstName.trim(), f.lastName.trim()].filter(Boolean).join(' ')
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:${e(f.lastName)};${e(f.firstName)};;;`]
  lines.push(`FN:${escapeVText(fullName || f.organization.trim())}`)
  if (f.organization.trim()) lines.push(`ORG:${e(f.organization)}`)
  if (f.title.trim()) lines.push(`TITLE:${e(f.title)}`)
  if (f.mobile.trim()) lines.push(`TEL;TYPE=CELL:${normalizePhone(f.mobile)}`)
  if (f.workPhone.trim()) lines.push(`TEL;TYPE=WORK:${normalizePhone(f.workPhone)}`)
  if (f.email.trim()) lines.push(`EMAIL:${f.email.trim()}`)
  if (website) lines.push(`URL:${website}`)
  const adr = [f.street, f.city, f.region, f.postalCode, f.country]
  if (adr.some((v) => v.trim())) lines.push(`ADR;TYPE=WORK:;;${adr.map(e).join(';')}`)
  if (f.note.trim()) lines.push(`NOTE:${e(f.note)}`)
  lines.push('END:VCARD')
  return ok(lines.join('\n'))
}

function encodeEmail(f: EmailFields): EncodeResult {
  if (!f.to.trim()) return empty()
  if (!isValidEmail(f.to)) return invalid({ to: 'Check the email address.' })
  const params: string[] = []
  if (f.subject.trim()) params.push('subject=' + encodeURIComponent(f.subject.trim()))
  if (f.body.trim()) params.push('body=' + encodeURIComponent(f.body))
  return ok(`mailto:${f.to.trim()}${params.length ? '?' + params.join('&') : ''}`)
}

function encodeSms(f: SmsFields): EncodeResult {
  if (!f.phone.trim()) return empty()
  const phone = normalizePhone(f.phone)
  if (!isValidPhone(phone)) return invalid({ phone: 'Check the phone number.' })
  return ok(`SMSTO:${phone}:${f.message}`)
}

function encodePhone(f: PhoneFields): EncodeResult {
  if (!f.phone.trim()) return empty()
  const phone = normalizePhone(f.phone)
  if (!isValidPhone(phone)) return invalid({ phone: 'Check the phone number.' })
  return ok(`tel:${phone}`)
}

function encodeWhatsapp(f: WhatsappFields): EncodeResult {
  if (!f.phone.trim()) return empty()
  let digits = normalizePhone(f.phone).replace('+', '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.length < 7 || digits.length > 15) {
    return invalid({ phone: 'Enter the full number with country code, like +1 555 123 4567.' })
  }
  const text = f.message.trim() ? '?text=' + encodeURIComponent(f.message) : ''
  return ok(`https://wa.me/${digits}${text}`)
}

function encodeLocation(f: LocationFields): EncodeResult {
  const base = 'https://www.google.com/maps/search/?api=1&query='
  if (f.mode === 'address') {
    if (!f.address.trim()) return empty()
    const placeId = f.placeId?.trim()
    return ok(
      base +
        encodeURIComponent(f.address.trim()) +
        (placeId ? `&query_place_id=${encodeURIComponent(placeId)}` : ''),
    )
  }
  if (!f.latitude.trim() && !f.longitude.trim()) return empty()
  const lat = Number(f.latitude)
  const lng = Number(f.longitude)
  const errors: FieldErrors = {}
  if (!f.latitude.trim() || !Number.isFinite(lat) || lat < -90 || lat > 90) {
    errors.latitude = 'Latitude is a number from -90 to 90.'
  }
  if (!f.longitude.trim() || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    errors.longitude = 'Longitude is a number from -180 to 180.'
  }
  if (Object.keys(errors).length) return invalid(errors)
  return ok(base + `${lat},${lng}`)
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/

/** `2026-10-20T09:30` → `20261020T093000` (floating local time). */
function icalDateTime(value: string): string | null {
  const m = DATETIME_RE.exec(value)
  return m ? `${m[1]}${m[2]}${m[3]}T${m[4]}${m[5]}00` : null
}

function icalDate(value: string): string | null {
  const m = DATE_RE.exec(value.slice(0, 10))
  return m ? `${m[1]}${m[2]}${m[3]}` : null
}

/** Adds one day to an iCal date (all-day DTEND is exclusive). */
function nextDay(yyyymmdd: string): string {
  const d = new Date(
    Date.UTC(+yyyymmdd.slice(0, 4), +yyyymmdd.slice(4, 6) - 1, +yyyymmdd.slice(6, 8) + 1),
  )
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

function encodeEvent(f: EventFields): EncodeResult {
  if (!f.title.trim() && !f.start) return empty()
  const errors: FieldErrors = {}
  if (!f.title.trim()) errors.title = 'Give the event a name.'
  const lines = ['BEGIN:VEVENT', `SUMMARY:${escapeVText(f.title.trim())}`]
  if (f.allDay) {
    const start = icalDate(f.start)
    const end = f.end ? icalDate(f.end) : start
    if (!start) errors.start = 'Choose a start date.'
    else if (!end || end < start) errors.end = 'The end date is before the start date.'
    else {
      lines.push(`DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${nextDay(end)}`)
    }
  } else {
    const start = icalDateTime(f.start)
    const end = f.end ? icalDateTime(f.end) : null
    if (!start) errors.start = 'Choose a start date and time.'
    else if (f.end && (!end || end <= start)) errors.end = 'The end is before the start.'
    else {
      lines.push(`DTSTART:${start}`)
      if (end) lines.push(`DTEND:${end}`)
    }
  }
  if (Object.keys(errors).length) return invalid(errors)
  if (f.location.trim()) lines.push(`LOCATION:${escapeVText(f.location.trim())}`)
  if (f.description.trim()) lines.push(`DESCRIPTION:${escapeVText(f.description.trim())}`)
  lines.push('END:VEVENT')
  return ok(lines.join('\n'))
}

const STORE_HOSTS: Record<AppFields['store'], string[]> = {
  ios: ['apps.apple.com', 'itunes.apple.com'],
  android: ['play.google.com'],
}

function encodeApp(f: AppFields): EncodeResult {
  if (!f.url.trim()) return empty()
  const url = normalizeWebUrl(f.url)
  const host = url ? new URL(url).hostname : ''
  if (!url || !STORE_HOSTS[f.store].includes(host)) {
    return invalid({
      url:
        f.store === 'ios'
          ? 'Paste the App Store link, starting with apps.apple.com.'
          : 'Paste the Google Play link, starting with play.google.com.',
    })
  }
  return ok(url)
}

const SOCIAL_URL: Record<SocialPlatform, (handle: string) => string> = {
  instagram: (h) => `https://www.instagram.com/${h}`,
  facebook: (h) => `https://www.facebook.com/${h}`,
  x: (h) => `https://x.com/${h}`,
  tiktok: (h) => `https://www.tiktok.com/@${h}`,
  linkedin: (h) => `https://www.linkedin.com/in/${h}`,
  youtube: (h) => `https://www.youtube.com/@${h}`,
  threads: (h) => `https://www.threads.com/@${h}`,
  pinterest: (h) => `https://www.pinterest.com/${h}`,
}

function encodeSocial(f: SocialFields): EncodeResult {
  const value = f.handle.trim()
  if (!value) return empty()
  // A pasted profile link is used as is.
  if (/^(https?:\/\/|www\.)/i.test(value) || /\.[a-z]{2,}\//i.test(value)) {
    const url = normalizeWebUrl(value)
    return url ? ok(url) : invalid({ handle: 'Check the profile link.' })
  }
  const handle = value.replace(/^@/, '')
  if (!/^[\w.-]{1,100}$/.test(handle)) {
    return invalid({ handle: 'Enter the username without spaces, or paste the profile link.' })
  }
  return ok(SOCIAL_URL[f.platform](handle))
}

const ENCODERS: { [K in ContentType]: (f: ContentFields[K]) => EncodeResult } = {
  url: encodeUrl,
  text: encodeText,
  wifi: encodeWifi,
  vcard: encodeVcard,
  email: encodeEmail,
  sms: encodeSms,
  phone: encodePhone,
  whatsapp: encodeWhatsapp,
  location: encodeLocation,
  event: encodeEvent,
  app: encodeApp,
  social: encodeSocial,
}

export function encodeContent<K extends ContentType>(
  type: K,
  fields: ContentFields[K],
): EncodeResult {
  return ENCODERS[type](fields)
}
