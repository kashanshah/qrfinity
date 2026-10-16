/**
 * Reads the text inside a QR code back into one of our content types, so a scanned code can be
 * shown plainly and re-made in the generator. The reverse of the encoders in `./index`, plus the
 * common formats other generators use (MATMSG email, `sms:` links, `geo:` points, vCards with
 * folded lines, events wrapped in VCALENDAR).
 */
import {
  DEFAULT_FIELDS,
  encodeContent,
  normalizeWebUrl,
  type ContentFields,
  type ContentType,
} from './index'
import { parsePayment } from './payment'

export type ParsedContent = {
  [K in ContentType]: { type: K; fields: ContentFields[K] }
}[ContentType]

const with_ = <K extends ContentType>(
  type: K,
  patch: Partial<ContentFields[K]>,
): { type: K; fields: ContentFields[K] } => ({
  type,
  fields: { ...DEFAULT_FIELDS[type], ...patch },
})

export function parseContent(raw: string): ParsedContent {
  const text = raw.trim()
  if (!text) return with_('text', { text: raw })
  const upper = text.toUpperCase()

  // Payment codes count only if re-making them gives back exactly the same code.
  const payment = parsePayment(text)
  if (payment) {
    const again = encodeContent('payment', payment)
    if (again.ok && again.payload === text) return with_('payment', payment)
  }

  if (upper.startsWith('WIFI:')) return parseWifi(text)
  if (upper.startsWith('BEGIN:VCARD')) return parseVcard(text)
  if (upper.startsWith('BEGIN:VEVENT') || upper.startsWith('BEGIN:VCALENDAR'))
    return parseEvent(text)
  if (upper.startsWith('MAILTO:')) return parseMailto(text)
  if (upper.startsWith('MATMSG:')) return parseMatmsg(text)
  if (upper.startsWith('SMSTO:')) {
    const [phone = '', ...rest] = text.slice(6).split(':')
    return with_('sms', { phone, message: rest.join(':') })
  }
  if (upper.startsWith('SMS:')) {
    const [phone = '', query = ''] = text.slice(4).split('?')
    return with_('sms', { phone, message: new URLSearchParams(query).get('body') ?? '' })
  }
  if (upper.startsWith('TEL:')) return with_('phone', { phone: text.slice(4) })
  if (upper.startsWith('GEO:')) {
    const [lat = '', lng = ''] = text.slice(4).split(/[,;?]/)
    return with_('location', { mode: 'coordinates', latitude: lat, longitude: lng })
  }
  if (/^https?:\/\//i.test(text) && normalizeWebUrl(text)) return parseWebLink(text)
  return with_('text', { text: raw })
}

function parseWebLink(url: string): ParsedContent {
  const u = new URL(url)
  const host = u.hostname.toLowerCase().replace(/^www\./, '')
  if (host === 'wa.me') {
    return with_('whatsapp', {
      phone: '+' + u.pathname.replace(/\D/g, ''),
      message: u.searchParams.get('text') ?? '',
    })
  }
  if (host === 'google.com' && u.pathname.startsWith('/maps/search/')) {
    const query = u.searchParams.get('query') ?? ''
    const coords = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(query)
    if (coords) {
      return with_('location', { mode: 'coordinates', latitude: coords[1], longitude: coords[2] })
    }
    return with_('location', {
      mode: 'address',
      address: query,
      placeId: u.searchParams.get('query_place_id') ?? '',
    })
  }
  if (host === 'apps.apple.com' || host === 'itunes.apple.com') {
    return with_('app', { store: 'ios', url })
  }
  if (host === 'play.google.com') return with_('app', { store: 'android', url })
  return with_('url', { url })
}

/** Splits on separators that aren't escaped with a backslash. Escapes are kept in the parts. */
function splitEscaped(value: string, sep: string): string[] {
  const out: string[] = []
  let cur = ''
  for (let i = 0; i < value.length; i++) {
    const c = value[i]!
    if (c === '\\' && i + 1 < value.length) {
      cur += c + value[++i]
    } else if (c === sep) {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out
}

/** Wi-Fi and MATMSG values: a backslash escapes the next character. */
const unescapeSimple = (v: string) => v.replace(/\\(.)/g, '$1')

function parseWifi(text: string): ParsedContent {
  const fields: Record<string, string> = {}
  for (const part of splitEscaped(text.slice(5), ';')) {
    const i = part.indexOf(':')
    if (i > 0) fields[part.slice(0, i).toUpperCase()] = unescapeSimple(part.slice(i + 1))
  }
  const t = (fields.T ?? '').toUpperCase()
  const encryption = t === 'WEP' ? 'WEP' : t === 'NOPASS' || (!t && !fields.P) ? 'nopass' : 'WPA'
  return with_('wifi', {
    ssid: fields.S ?? '',
    password: encryption === 'nopass' ? '' : (fields.P ?? ''),
    encryption,
    hidden: (fields.H ?? '').toLowerCase() === 'true',
  })
}

/** vCard / iCalendar lines: unfolded, with the property name, parameters and value split. */
function contentLines(text: string) {
  const unfolded = text.replace(/\r\n|\r/g, '\n').replace(/\n[ \t]/g, '')
  return unfolded.split('\n').flatMap((line) => {
    const i = line.indexOf(':')
    if (i <= 0) return []
    const [name = '', ...params] = line.slice(0, i).split(';')
    return [
      {
        name: name.toUpperCase(),
        params: params.join(';').toUpperCase(),
        value: line.slice(i + 1),
      },
    ]
  })
}

const unescapeText = (v: string) =>
  v.replace(/\\(n|N|\\|;|,)/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c))

function parseVcard(text: string): ParsedContent {
  const f: Partial<ContentFields['vcard']> = {}
  for (const { name, params, value } of contentLines(text)) {
    switch (name) {
      case 'N': {
        const [last = '', first = ''] = splitEscaped(value, ';').map(unescapeText)
        f.lastName = last
        f.firstName = first
        break
      }
      case 'FN':
        if (!f.firstName && !f.lastName) {
          const full = unescapeText(value).trim()
          const space = full.lastIndexOf(' ')
          f.firstName = space > 0 ? full.slice(0, space) : full
          f.lastName = space > 0 ? full.slice(space + 1) : ''
        }
        break
      case 'ORG':
        f.organization = unescapeText(splitEscaped(value, ';')[0] ?? '')
        break
      case 'TITLE':
        f.title = unescapeText(value)
        break
      case 'TEL':
        if (/WORK/.test(params) && !f.workPhone) f.workPhone = value
        else if (!f.mobile) f.mobile = value
        else if (!f.workPhone) f.workPhone = value
        break
      case 'EMAIL':
        f.email ||= value
        break
      case 'URL':
        f.website ||= value
        break
      case 'ADR': {
        const [, , street = '', city = '', region = '', postalCode = '', country = ''] =
          splitEscaped(value, ';').map(unescapeText)
        Object.assign(f, { street, city, region, postalCode, country })
        break
      }
      case 'NOTE':
        f.note = unescapeText(value)
        break
    }
  }
  return with_('vcard', f)
}

/** `20261020T093000` → `2026-10-20T09:30`; `20261020` → `2026-10-20`. */
function fromIcal(value: string): { value: string; date: boolean } | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/.exec(value)
  if (!m) return null
  const date = `${m[1]}-${m[2]}-${m[3]}`
  return m[4] ? { value: `${date}T${m[4]}:${m[5]}`, date: false } : { value: date, date: true }
}

function previousDay(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

function parseEvent(text: string): ParsedContent {
  const f: Partial<ContentFields['event']> = {}
  let endRaw: { value: string; date: boolean } | null = null
  for (const { name, params, value } of contentLines(text)) {
    if (name === 'SUMMARY') f.title = unescapeText(value)
    else if (name === 'LOCATION') f.location = unescapeText(value)
    else if (name === 'DESCRIPTION') f.description = unescapeText(value)
    else if (name === 'DTSTART') {
      const s = fromIcal(value)
      if (s) {
        f.start = s.value
        f.allDay = s.date || params.includes('VALUE=DATE')
      }
    } else if (name === 'DTEND') endRaw = fromIcal(value)
  }
  if (endRaw) {
    // All-day DTEND is exclusive; the form holds the last day.
    f.end = f.allDay && endRaw.date ? previousDay(endRaw.value) : endRaw.value
  }
  return with_('event', f)
}

function parseMailto(text: string): ParsedContent {
  const [to = '', query = ''] = text.slice(7).split('?')
  const q = new URLSearchParams(query)
  return with_('email', {
    to: decodeURIComponent(to),
    subject: q.get('subject') ?? '',
    body: q.get('body') ?? '',
  })
}

function parseMatmsg(text: string): ParsedContent {
  const fields: Record<string, string> = {}
  for (const part of splitEscaped(text.slice(7), ';')) {
    const i = part.indexOf(':')
    if (i > 0) fields[part.slice(0, i).toUpperCase()] = unescapeSimple(part.slice(i + 1))
  }
  return with_('email', { to: fields.TO ?? '', subject: fields.SUB ?? '', body: fields.BODY ?? '' })
}
