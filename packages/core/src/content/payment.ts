/**
 * Payment codes: a link to a PayPal.Me, Venmo or Cash App profile, or a code a banking app pays
 * directly, India's UPI (`upi://pay?…`) and Brazil's Pix (an EMV "BR Code" with a CRC checksum).
 * We never touch the money: each code opens the payer's own app with the details filled in.
 */
import type { EncodeResult, FieldErrors } from './index'

export const PAYMENT_METHODS = ['paypal', 'venmo', 'cashapp', 'upi', 'pix'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export type PaymentFields = {
  method: PaymentMethod
  /** PayPal.Me name, Venmo username, $Cashtag, UPI ID or Pix key (or a pasted link). */
  account: string
  /** The payee's name (UPI and Pix). */
  name: string
  /** The payee's city (Pix). */
  city: string
  /** Optional fixed amount, in the account's currency. */
  amount: string
  /** Optional note shown to the payer (UPI and Pix). */
  note: string
}

export const DEFAULT_PAYMENT: PaymentFields = {
  method: 'paypal',
  account: '',
  name: '',
  city: '',
  amount: '',
  note: '',
}

/** Methods whose code is a web link, so a dynamic code can redirect to it. */
export function isLinkPayment(method: PaymentMethod): boolean {
  return method === 'paypal' || method === 'venmo' || method === 'cashapp'
}

/** Which methods take an amount, a name, a city and a note. */
export const PAYMENT_FIELDS: Record<
  PaymentMethod,
  { amount: boolean; name: boolean; city: boolean; note: boolean }
> = {
  paypal: { amount: true, name: false, city: false, note: false },
  venmo: { amount: false, name: false, city: false, note: false },
  cashapp: { amount: true, name: false, city: false, note: false },
  upi: { amount: true, name: true, city: false, note: true },
  pix: { amount: true, name: true, city: true, note: true },
}

const ok = (payload: string): EncodeResult => ({ ok: true, payload })
const empty = (): EncodeResult => ({ ok: false, reason: 'empty', errors: {} })
const invalid = (errors: FieldErrors): EncodeResult => ({ ok: false, reason: 'invalid', errors })

/** "12", "12.5", "12,50" → "12.00", "12.50"; null when it isn't a positive amount. */
export function normalizeAmount(input: string): string | null {
  const v = input.trim().replace(/\s/g, '').replace(',', '.')
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(v)) return null
  const n = Number(v)
  return n > 0 ? n.toFixed(2) : null
}

/** The last path segment of a pasted profile link, or the value itself. */
function handleFrom(value: string, hosts: string[]): string | null {
  const v = value.trim()
  const m = /^(?:https?:\/\/)?(?:www\.)?([^/\s]+)\/(.*)$/i.exec(v)
  if (!m) return v
  if (!hosts.includes(m[1]!.toLowerCase())) return null
  return m[2]!.split(/[/?#]/).filter(Boolean)[0] ?? null
}

// ---------------------------------------------------------------------------
// Link methods

function encodePaypal(f: PaymentFields, amount: string | null): EncodeResult {
  const name = handleFrom(f.account, ['paypal.me', 'paypal.com'])
  if (!name || !/^[A-Za-z0-9]{1,20}$/.test(name)) {
    return invalid({ account: 'Enter your PayPal.Me name, or paste your paypal.me link.' })
  }
  return ok(`https://paypal.me/${name}${amount ? `/${amount}` : ''}`)
}

function encodeVenmo(f: PaymentFields): EncodeResult {
  const value = f.account.replace(/\/u\//i, '/')
  const name = handleFrom(value, ['venmo.com', 'account.venmo.com'])?.replace(/^@/, '')
  if (!name || !/^[A-Za-z0-9_-]{5,30}$/.test(name)) {
    return invalid({ account: 'Enter your Venmo username, or paste your venmo.com link.' })
  }
  return ok(`https://venmo.com/u/${name}`)
}

function encodeCashapp(f: PaymentFields, amount: string | null): EncodeResult {
  const tag = handleFrom(f.account, ['cash.app', 'cash.me'])?.replace(/^\$?/, '')
  if (!tag || !/^[A-Za-z][A-Za-z0-9_-]{0,19}$/.test(tag)) {
    return invalid({ account: 'Enter your $Cashtag, or paste your cash.app link.' })
  }
  // Cash App shows whole and decimal amounts; trailing zeros are dropped ("25", "12.5").
  return ok(`https://cash.app/$${tag}${amount ? `/${Number(amount)}` : ''}`)
}

// ---------------------------------------------------------------------------
// UPI (NPCI's "UPI Linking Specification": upi://pay with pa, pn, am, cu and tn)

const UPI_ID_RE = /^[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9.-]{1,64}$/

function encodeUpi(f: PaymentFields, amount: string | null): EncodeResult {
  const id = f.account.trim()
  const name = f.name.trim()
  if (!UPI_ID_RE.test(id)) return invalid({ account: 'Enter a UPI ID, like yourname@okbank.' })
  if (!name) return invalid({ name: 'Add the name people should see when they pay.' })
  // UPI apps expect the @ in the ID as it is; everything else that could break the query is escaped.
  const q = (v: string) => encodeURIComponent(v).replace(/%40/g, '@')
  let uri = `upi://pay?pa=${q(id)}&pn=${q(name.slice(0, 50))}`
  if (amount) uri += `&am=${amount}`
  uri += '&cu=INR'
  const note = f.note.trim()
  if (note) uri += `&tn=${q(note.slice(0, 50))}`
  return ok(uri)
}

// ---------------------------------------------------------------------------
// Pix (Banco Central do Brasil's static BR Code: EMV merchant-presented mode)

/** EMV field: 2-digit id, 2-digit length, value. */
const tlv = (id: string, value: string) => `${id}${String(value.length).padStart(2, '0')}${value}`

/** CRC-16/CCITT-FALSE (poly 0x1021, start 0xFFFF), as 4 upper-case hex digits. */
export function crc16(data: string): string {
  let crc = 0xffff
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8
    for (let b = 0; b < 8; b++)
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

/** Names and cities in a BR Code are plain ASCII: accents removed, other characters dropped. */
function pixText(value: string, max: number): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 .,/-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim()
}

/** A Pix key as the BR Code holds it: CPF or CNPJ digits, +55 phone, email or random key. */
export function normalizePixKey(input: string): string | null {
  const v = input.trim()
  if (!v) return null
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v))
    return v.toLowerCase()
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return v.toLowerCase().slice(0, 77)
  if (v.startsWith('+')) {
    const digits = v.replace(/\D/g, '')
    return /^55\d{10,11}$/.test(digits) ? `+${digits}` : null
  }
  // CPF (11 digits) or CNPJ (14), with or without dots, dashes and a slash.
  if (/^[\d.\-/\s]+$/.test(v)) {
    const digits = v.replace(/\D/g, '')
    return digits.length === 11 || digits.length === 14 ? digits : null
  }
  return null
}

function encodePix(f: PaymentFields, amount: string | null): EncodeResult {
  const key = normalizePixKey(f.account)
  if (!key) {
    return invalid({
      account: 'Enter a Pix key: CPF, CNPJ, email, phone starting with +55, or random key.',
    })
  }
  const name = pixText(f.name, 25)
  const city = pixText(f.city, 15)
  if (!name) return invalid({ name: 'Add the name registered with your Pix key.' })
  if (!city) return invalid({ city: 'Add your city.' })
  // The account block holds at most 99 characters, the note included.
  const base = tlv('00', 'br.gov.bcb.pix') + tlv('01', key)
  const room = 99 - base.length - 4
  const note = room > 0 ? pixText(f.note, Math.min(room, 72)) : ''
  const account = base + (note ? tlv('02', note) : '')
  const body =
    tlv('00', '01') +
    tlv('26', account) +
    tlv('52', '0000') +
    tlv('53', '986') +
    (amount ? tlv('54', amount) : '') +
    tlv('58', 'BR') +
    tlv('59', name) +
    tlv('60', city) +
    tlv('62', tlv('05', '***')) +
    '6304'
  return ok(body + crc16(body))
}

// ---------------------------------------------------------------------------

export function encodePayment(f: PaymentFields): EncodeResult {
  if (!f.account.trim()) return empty()
  let amount: string | null = null
  if (PAYMENT_FIELDS[f.method].amount && f.amount.trim()) {
    amount = normalizeAmount(f.amount)
    if (!amount) return invalid({ amount: 'Enter an amount like 12.50, or leave it empty.' })
  }
  switch (f.method) {
    case 'paypal':
      return encodePaypal(f, amount)
    case 'venmo':
      return encodeVenmo(f)
    case 'cashapp':
      return encodeCashapp(f, amount)
    case 'upi':
      return encodeUpi(f, amount)
    case 'pix':
      return encodePix(f, amount)
  }
}

// ---------------------------------------------------------------------------
// Reading codes back

/** Splits EMV fields; null if the lengths don't add up. */
function readTlv(data: string): Map<string, string> | null {
  const out = new Map<string, string>()
  let i = 0
  while (i < data.length) {
    const id = data.slice(i, i + 2)
    const len = Number(data.slice(i + 2, i + 4))
    if (id.length < 2 || !Number.isInteger(len) || i + 4 + len > data.length) return null
    out.set(id, data.slice(i + 4, i + 4 + len))
    i += 4 + len
  }
  return out
}

/** Payment fields from a UPI or Pix code, or a PayPal.Me, Venmo or Cash App link; else null. */
export function parsePayment(text: string): PaymentFields | null {
  if (/^upi:\/\/pay\?/i.test(text)) {
    const q = new URLSearchParams(text.slice(text.indexOf('?') + 1))
    const id = q.get('pa')
    if (!id) return null
    return {
      ...DEFAULT_PAYMENT,
      method: 'upi',
      account: id,
      name: q.get('pn') ?? '',
      amount: q.get('am') ?? '',
      note: q.get('tn') ?? '',
    }
  }
  if (text.startsWith('000201')) {
    const top = readTlv(text)
    const account = top && readTlv(top.get('26') ?? '')
    if (!top || !account || account.get('00')?.toLowerCase() !== 'br.gov.bcb.pix') return null
    const key = account.get('01')
    if (!key) return null
    return {
      ...DEFAULT_PAYMENT,
      method: 'pix',
      account: key,
      name: top.get('59') ?? '',
      city: top.get('60') ?? '',
      amount: top.get('54') ?? '',
      note: account.get('02') ?? '',
    }
  }
  const link = /^https:\/\/(paypal\.me|venmo\.com\/u|cash\.app)\/([^/?#]+)(?:\/([\d.]+))?$/i.exec(
    text,
  )
  if (link) {
    const host = link[1]!.toLowerCase()
    const method: PaymentMethod =
      host === 'paypal.me' ? 'paypal' : host === 'cash.app' ? 'cashapp' : 'venmo'
    return { ...DEFAULT_PAYMENT, method, account: link[2]!, amount: link[3] ?? '' }
  }
  return null
}
