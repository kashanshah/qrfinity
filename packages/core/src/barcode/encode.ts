/**
 * Linear barcode encoders (our own, like the QR renderer): UPC-A, UPC-E, EAN-13, EAN-8, ITF-14,
 * Code 39, Code 128, ISBN (as EAN-13) and Amazon FNSKU (as Code 128). Each turns a checked value
 * into modules: a string of 1s (bar) and 0s (space), one character per narrowest bar width.
 * Wide elements (Code 39, ITF) are 3 modules, a ratio every scanner reads.
 */
import { gs1Data, gs1Text, parseGs1 } from './gs1'

export const BARCODE_TYPES = [
  'code128',
  'ean13',
  'upca',
  'ean8',
  'upce',
  'itf14',
  'code39',
  'isbn',
  'fnsku',
  'gs1128',
] as const

export type BarcodeType = (typeof BARCODE_TYPES)[number]

export function isBarcodeType(v: unknown): v is BarcodeType {
  return (BARCODE_TYPES as readonly unknown[]).includes(v)
}

/** Human-readable text, placed by module position (`from`–`to`, centred between them). */
export type TextRun = { text: string; from: number; to: number; small?: boolean }

export type Encoded = {
  /** '1' = bar, '0' = space, one per module. */
  modules: string
  /** Module ranges [from, to) whose bars run down past the text (EAN/UPC guards). */
  guards: [number, number][]
  /** Text under the bars, positioned in modules (negative = in the left quiet zone). */
  text: TextRun[]
  /** Text over the bars (ISBN). */
  above?: string
  /** Minimum blank margin each side, in modules. */
  quiet: { left: number; right: number }
  /** ITF-14 bearer bars above and below. */
  bearer?: boolean
  /** EAN-2/EAN-5 add-on to the right, with its digits printed above it. */
  addon?: { modules: string; text: string; gap: number }
}

// ---------------------------------------------------------------------------
// GTIN check digit (UPC, EAN, ITF-14): weights 3,1,3,1… from the right.

export function gtinCheckDigit(digits: string): number {
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    const d = Number(digits[digits.length - 1 - i])
    sum += i % 2 === 0 ? d * 3 : d
  }
  return (10 - (sum % 10)) % 10
}

// ---------------------------------------------------------------------------
// EAN / UPC

const L = [
  '0001101',
  '0011001',
  '0010011',
  '0111101',
  '0100011',
  '0110001',
  '0101111',
  '0111011',
  '0110111',
  '0001011',
]
const G = [
  '0100111',
  '0110011',
  '0011011',
  '0100001',
  '0011101',
  '0111001',
  '0000101',
  '0010001',
  '0001001',
  '0010111',
]
const R = [
  '1110010',
  '1100110',
  '1101100',
  '1000010',
  '1011100',
  '1001110',
  '1010000',
  '1000100',
  '1001000',
  '1110100',
]
const EAN13_PARITY = [
  'LLLLLL',
  'LLGLGG',
  'LLGGLG',
  'LLGGGL',
  'LGLLGG',
  'LGGLLG',
  'LGGGLL',
  'LGLGLG',
  'LGLGGL',
  'LGGLGL',
]

const digit = (s: string, i: number) => Number(s[i])

/** 13 digits (check included) → EAN-13 modules (95). */
function ean13Modules(d: string): string {
  const parity = EAN13_PARITY[digit(d, 0)]!
  let m = '101'
  for (let i = 1; i <= 6; i++) m += (parity[i - 1] === 'L' ? L : G)[digit(d, i)]
  m += '01010'
  for (let i = 7; i <= 12; i++) m += R[digit(d, i)]
  return m + '101'
}

const EAN_GUARDS: [number, number][] = [
  [0, 3],
  [45, 50],
  [92, 95],
]

function encodeEan13(d: string): Encoded {
  return {
    modules: ean13Modules(d),
    guards: EAN_GUARDS,
    text: [
      { text: d[0]!, from: -8, to: -1 },
      { text: d.slice(1, 7), from: 3, to: 45 },
      { text: d.slice(7), from: 50, to: 92 },
    ],
    quiet: { left: 11, right: 7 },
  }
}

function encodeUpcA(d: string): Encoded {
  // A UPC-A is an EAN-13 starting with 0; its first and last digits' bars are guards too.
  return {
    modules: ean13Modules('0' + d),
    guards: [
      [0, 10],
      [45, 50],
      [85, 95],
    ],
    text: [
      { text: d[0]!, from: -8, to: -1, small: true },
      { text: d.slice(1, 6), from: 10, to: 45 },
      { text: d.slice(6, 11), from: 50, to: 85 },
      { text: d[11]!, from: 96, to: 103, small: true },
    ],
    quiet: { left: 9, right: 9 },
  }
}

function encodeEan8(d: string): Encoded {
  let m = '101'
  for (let i = 0; i < 4; i++) m += L[digit(d, i)]
  m += '01010'
  for (let i = 4; i < 8; i++) m += R[digit(d, i)]
  m += '101'
  return {
    modules: m,
    guards: [
      [0, 3],
      [31, 36],
      [64, 67],
    ],
    text: [
      { text: d.slice(0, 4), from: 3, to: 31 },
      { text: d.slice(4), from: 36, to: 64 },
    ],
    quiet: { left: 7, right: 7 },
  }
}

// UPC-E parity for number system 0, by check digit (E = even/G, O = odd/L); number system 1 is the reverse.
const UPCE_PARITY = [
  'EEEOOO',
  'EEOEOO',
  'EEOOEO',
  'EEOOOE',
  'EOEEOO',
  'EOOEEO',
  'EOOOEE',
  'EOEOEO',
  'EOEOOE',
  'EOOEOE',
]

/** UPC-E's 6 digits plus number system → the 11 UPC-A digits it stands for (no check digit). */
export function upceToUpca(ns: string, six: string): string {
  const [a, b, c, d, e, f] = six.split('')
  switch (f) {
    case '0':
    case '1':
    case '2':
      return `${ns}${a}${b}${f}0000${c}${d}${e}`
    case '3':
      return `${ns}${a}${b}${c}00000${d}${e}`
    case '4':
      return `${ns}${a}${b}${c}${d}00000${e}`
    default:
      return `${ns}${a}${b}${c}${d}${e}0000${f}`
  }
}

/** 8 digits: number system, 6 digits, check. */
function encodeUpcE(d: string): Encoded {
  const ns = digit(d, 0)
  const check = digit(d, 7)
  const pattern = UPCE_PARITY[check]!
  let m = '101'
  for (let i = 0; i < 6; i++) {
    const even = pattern[i] === 'E'
    m += (even !== (ns === 1) ? G : L)[digit(d, i + 1)]
  }
  m += '010101'
  return {
    modules: m,
    guards: [
      [0, 3],
      [45, 51],
    ],
    text: [
      { text: d[0]!, from: -8, to: -1, small: true },
      { text: d.slice(1, 7), from: 3, to: 45 },
      { text: d[7]!, from: 52, to: 59, small: true },
    ],
    quiet: { left: 9, right: 9 },
  }
}

// EAN-2 / EAN-5 add-ons (price or issue number, beside an EAN-13 or UPC-A)

const EAN5_PARITY = [
  'GGLLL',
  'GLGLL',
  'GLLGL',
  'GLLLG',
  'LGGLL',
  'LLGGL',
  'LLLGG',
  'LGLGL',
  'LGLLG',
  'LLGLG',
]
const EAN2_PARITY = ['LL', 'LG', 'GL', 'GG']

/** 2 or 5 digits → add-on modules: start 1011, digits separated by 01. */
export function addonModules(d: string): string {
  let parity: string
  if (d.length === 5) {
    const sum = 3 * (digit(d, 0) + digit(d, 2) + digit(d, 4)) + 9 * (digit(d, 1) + digit(d, 3))
    parity = EAN5_PARITY[sum % 10]!
  } else {
    parity = EAN2_PARITY[Number(d) % 4]!
  }
  let m = '1011'
  for (let i = 0; i < d.length; i++) {
    if (i > 0) m += '01'
    m += (parity[i] === 'L' ? L : G)[digit(d, i)]
  }
  return m
}

/** Adds an add-on (2 or 5 digits) to an EAN-13 or UPC-A, with the 9-module gap the standard asks for. */
function withAddon(enc: Encoded, addon?: string): Encoded {
  if (!addon) return enc
  return {
    ...enc,
    addon: { modules: addonModules(addon), text: addon, gap: 9 },
    quiet: { ...enc.quiet, right: 5 },
  }
}

// ---------------------------------------------------------------------------
// ITF-14 (interleaved 2 of 5)

const ITF = [
  'nnwwn',
  'wnnnw',
  'nwnnw',
  'wwnnn',
  'nnwnw',
  'wnwnn',
  'nwwnn',
  'nnnww',
  'wnnwn',
  'nwnwn',
]
const W = 3

function encodeItf14(d: string): Encoded {
  let m = '1010' // start: narrow bar, space, bar, space
  for (let i = 0; i < d.length; i += 2) {
    const bars = ITF[digit(d, i)]!
    const spaces = ITF[digit(d, i + 1)]!
    for (let k = 0; k < 5; k++) {
      m += '1'.repeat(bars[k] === 'w' ? W : 1)
      m += '0'.repeat(spaces[k] === 'w' ? W : 1)
    }
  }
  m += '1'.repeat(W) + '01' // stop: wide bar, narrow space, narrow bar
  const groups = `${d[0]} ${d.slice(1, 3)} ${d.slice(3, 8)} ${d.slice(8, 13)} ${d[13]}`
  return {
    modules: m,
    guards: [],
    text: [{ text: groups, from: 0, to: m.length }],
    quiet: { left: 10, right: 10 },
    bearer: true,
  }
}

// ---------------------------------------------------------------------------
// Code 39

const CODE39: Record<string, string> = {
  '0': '000110100',
  '1': '100100001',
  '2': '001100001',
  '3': '101100000',
  '4': '000110001',
  '5': '100110000',
  '6': '001110000',
  '7': '000100101',
  '8': '100100100',
  '9': '001100100',
  A: '100001001',
  B: '001001001',
  C: '101001000',
  D: '000011001',
  E: '100011000',
  F: '001011000',
  G: '000001101',
  H: '100001100',
  I: '001001100',
  J: '000011100',
  K: '100000011',
  L: '001000011',
  M: '101000010',
  N: '000010011',
  O: '100010010',
  P: '001010010',
  Q: '000000111',
  R: '100000110',
  S: '001000110',
  T: '000010110',
  U: '110000001',
  V: '011000001',
  W: '111000000',
  X: '010010001',
  Y: '110010000',
  Z: '011010000',
  '-': '010000101',
  '.': '110000100',
  ' ': '011000100',
  '*': '010010100',
  $: '010101000',
  '/': '010100010',
  '+': '010001010',
  '%': '000101010',
}

export const CODE39_CHARS = Object.keys(CODE39).filter((c) => c !== '*')

function code39Char(ch: string): string {
  const p = CODE39[ch]!
  let m = ''
  for (let i = 0; i < 9; i++) m += (i % 2 === 0 ? '1' : '0').repeat(p[i] === '1' ? W : 1)
  return m
}

function encodeCode39(value: string): Encoded {
  // Characters are separated by one narrow space.
  const m = `*${value}*`.split('').map(code39Char).join('0')
  return {
    modules: m,
    guards: [],
    text: [{ text: value, from: 0, to: m.length }],
    quiet: { left: 10, right: 10 },
  }
}

// ---------------------------------------------------------------------------
// Code 128 (sets B and C, switching to C for runs of digits)

const C128 = [
  '212222',
  '222122',
  '222221',
  '121223',
  '121322',
  '131222',
  '122213',
  '122312',
  '132212',
  '221213',
  '221312',
  '231212',
  '112232',
  '122132',
  '122231',
  '113222',
  '123122',
  '123221',
  '223211',
  '221132',
  '221231',
  '213212',
  '223112',
  '312131',
  '311222',
  '321122',
  '321221',
  '312212',
  '322112',
  '322211',
  '212123',
  '212321',
  '232121',
  '111323',
  '131123',
  '131321',
  '112313',
  '132113',
  '132311',
  '211313',
  '231113',
  '231311',
  '112133',
  '112331',
  '132131',
  '113123',
  '113321',
  '133121',
  '313121',
  '211331',
  '231131',
  '213113',
  '213311',
  '213131',
  '311123',
  '311321',
  '331121',
  '312113',
  '312311',
  '332111',
  '314111',
  '221411',
  '431111',
  '111224',
  '111422',
  '121124',
  '121421',
  '141122',
  '141221',
  '112214',
  '112412',
  '122114',
  '122411',
  '142112',
  '142211',
  '241211',
  '221114',
  '413111',
  '241112',
  '134111',
  '111242',
  '121142',
  '121241',
  '114212',
  '124112',
  '124211',
  '411212',
  '421112',
  '421211',
  '212141',
  '214121',
  '412121',
  '111143',
  '111341',
  '131141',
  '114113',
  '114311',
  '411113',
  '411311',
  '113141',
  '114131',
  '311141',
  '411131',
  '211412',
  '211214',
  '211232',
  '2331112',
]
const START_B = 104
const START_C = 105
const CODE_B = 100
const CODE_C = 99
const STOP = 106

/** Length of the run of digits starting at `i`. */
function digitRun(s: string, i: number): number {
  let n = 0
  while (i + n < s.length && s.charCodeAt(i + n) >= 48 && s.charCodeAt(i + n) <= 57) n++
  return n
}

/** Marks FNC1 in Code 128 input (GS1-128 uses it at the start and after variable-length fields). */
export const FNC1 = '\x1d'
const FNC1_VALUE = 102

/** Printable ASCII (and FNC1) → Code 128 symbol values (start code first, no check or stop). */
export function code128Values(s: string): number[] {
  const out: number[] = []
  let set: 'B' | 'C'
  const first = s[0] === FNC1 ? 1 : 0
  const lead = digitRun(s, first)
  // Start in C when the data opens with 4+ digits (or is all digits, 2+).
  if (lead >= 4 || (lead === s.length - first && lead >= 2)) {
    set = 'C'
    out.push(START_C)
  } else {
    set = 'B'
    out.push(START_B)
  }
  let i = 0
  while (i < s.length) {
    // FNC1 has the same value in sets B and C.
    if (s[i] === FNC1) {
      out.push(FNC1_VALUE)
      i++
      continue
    }
    if (set === 'C') {
      if (digitRun(s, i) >= 2) {
        out.push(Number(s.slice(i, i + 2)))
        i += 2
        continue
      }
      out.push(CODE_B)
      set = 'B'
    }
    const run = digitRun(s, i)
    const atEnd = i + run === s.length
    // Switch to C for 6+ digits mid-string, or 4+ at the end; keep an odd leading digit in B.
    if (run >= 6 || (atEnd && run >= 4)) {
      if (run % 2 === 1) {
        out.push(s.charCodeAt(i) - 32)
        i++
      }
      out.push(CODE_C)
      set = 'C'
      continue
    }
    out.push(s.charCodeAt(i) - 32)
    i++
  }
  return out
}

function encodeCode128(value: string): Encoded {
  const values = code128Values(value)
  const check = values.reduce((sum, v, i) => sum + v * (i === 0 ? 1 : i), 0) % 103
  let m = ''
  for (const v of [...values, check, STOP]) {
    const p = C128[v]!
    for (let i = 0; i < p.length; i++) m += (i % 2 === 0 ? '1' : '0').repeat(Number(p[i]))
  }
  return {
    modules: m,
    guards: [],
    text: [{ text: value, from: 0, to: m.length }],
    quiet: { left: 10, right: 10 },
  }
}

// ---------------------------------------------------------------------------
// Validation: what people type → the exact value to encode (check digits added or checked).

export type Checked =
  | {
      ok: true
      value: string
      /** Shown above the bars (ISBN). */
      above?: string
      note?: string
    }
  | { ok: false; error: string }

const onlyDigits = (s: string) => s.replace(/[\s-]/g, '')

/** Checks a GTIN of `len` digits: accepts it without the check digit (adds it) or with (verifies it). */
function checkGtin(input: string, len: number, name: string): Checked {
  const d = onlyDigits(input)
  if (!/^\d*$/.test(d)) return { ok: false, error: `${name} uses digits only.` }
  if (d.length === len - 1) return { ok: true, value: d + gtinCheckDigit(d) }
  if (d.length !== len)
    return {
      ok: false,
      error: `${name} has ${len} digits (or ${len - 1}, and we add the check digit).`,
    }
  const expected = gtinCheckDigit(d.slice(0, -1))
  if (Number(d[len - 1]) !== expected)
    return {
      ok: false,
      error: `The last digit should be ${expected}, the check digit for the first ${len - 1}. Check the number.`,
    }
  return { ok: true, value: d }
}

function checkIsbn(input: string): Checked {
  const raw = input.replace(/^isbn[:\s]*/i, '').trim()
  const d = raw.replace(/[\s-]/g, '').toUpperCase()
  if (/^\d{9}[\dX]$/.test(d)) {
    // ISBN-10: verify its own check (mod 11), then carry it into EAN-13 with prefix 978.
    let sum = 0
    for (let i = 0; i < 9; i++) sum += Number(d[i]) * (10 - i)
    const check = (11 - (sum % 11)) % 11
    const expected = check === 10 ? 'X' : String(check)
    if (d[9] !== expected)
      return { ok: false, error: `That ISBN-10 should end in ${expected}. Check the number.` }
    const twelve = '978' + d.slice(0, 9)
    const value = twelve + gtinCheckDigit(twelve)
    return { ok: true, value, above: `ISBN ${value}`, note: 'Converted from ISBN-10 to ISBN-13.' }
  }
  if (!/^97[89]\d{10}$/.test(d) && !/^97[89]\d{9}$/.test(d))
    return {
      ok: false,
      error: 'An ISBN has 13 digits starting with 978 or 979, or 10 characters (old style).',
    }
  const checked = checkGtin(d, 13, 'An ISBN-13')
  if (!checked.ok) return checked
  const shown =
    /^[\d-]+$/.test(raw) && raw.replace(/-/g, '') === checked.value ? raw : checked.value
  return { ...checked, above: `ISBN ${shown}` }
}

function checkUpcE(input: string): Checked {
  const d = onlyDigits(input)
  if (!/^\d+$/.test(d)) return { ok: false, error: 'UPC-E uses digits only.' }
  let ns = '0'
  let six: string
  let given: string | undefined
  if (d.length === 6) six = d
  else if (d.length === 7) [ns, six] = [d[0]!, d.slice(1)]
  else if (d.length === 8) [ns, six, given] = [d[0]!, d.slice(1, 7), d[7]]
  else return { ok: false, error: 'UPC-E has 6, 7 or 8 digits.' }
  if (ns !== '0' && ns !== '1')
    return { ok: false, error: 'UPC-E numbers start with 0 or 1 (the number system).' }
  const check = String(gtinCheckDigit(upceToUpca(ns, six)))
  if (given !== undefined && given !== check)
    return { ok: false, error: `The last digit should be ${check}. Check the number.` }
  return { ok: true, value: ns + six + check }
}

function checkCode39(input: string): Checked {
  const v = input.toUpperCase()
  if (!v) return { ok: false, error: 'Enter the text to encode.' }
  const bad = [...v].find((c) => !CODE39_CHARS.includes(c))
  if (bad)
    return {
      ok: false,
      error: `Code 39 can’t hold “${bad}”. Use A–Z, 0–9, space and - . $ / + %, or choose Code 128.`,
    }
  if (v.length > 43) return { ok: false, error: 'Keep Code 39 to 43 characters.' }
  return { ok: true, value: v }
}

function checkCode128(input: string): Checked {
  if (!input) return { ok: false, error: 'Enter the text to encode.' }
  if (!/^[\x20-\x7e]+$/.test(input))
    return {
      ok: false,
      error: 'Code 128 holds plain letters, digits, spaces and symbols (no accents or emoji).',
    }
  if (input.length > 80) return { ok: false, error: 'Keep it to 80 characters.' }
  return { ok: true, value: input }
}

function checkGs1(input: string): Checked {
  const parsed = parseGs1(input)
  if (!parsed.ok) return parsed
  return { ok: true, value: gs1Text(parsed.elements) }
}

/** An add-on: empty (none), or 2 or 5 digits. */
export function checkAddon(
  input: string,
): { ok: true; value: string } | { ok: false; error: string } {
  const d = input.replace(/\s/g, '')
  if (!d) return { ok: true, value: '' }
  if (!/^(\d{2}|\d{5})$/.test(d))
    return { ok: false, error: 'An add-on has 2 digits (issue number) or 5 (price).' }
  return { ok: true, value: d }
}

/** Amazon FNSKUs are 10 letters and digits, usually starting X00. ASINs (B0…) are also accepted. */
function checkFnsku(input: string): Checked {
  const v = input.replace(/\s/g, '').toUpperCase()
  if (!/^[A-Z0-9]{10}$/.test(v))
    return {
      ok: false,
      error:
        'An FNSKU has 10 letters and digits, like X001ABC2DE. Copy it from Seller Central (Inventory → Manage FBA inventory).',
    }
  return {
    ok: true,
    value: v,
    ...(/^(X0|B0)/.test(v)
      ? {}
      : {
          note: 'Most FNSKUs start with X0 (or B0 when Amazon uses the ASIN). Double-check it in Seller Central.',
        }),
  }
}

export function checkBarcodeValue(type: BarcodeType, input: string): Checked {
  switch (type) {
    case 'ean13':
      return checkGtin(input, 13, 'An EAN-13')
    case 'upca':
      return checkGtin(input, 12, 'A UPC-A')
    case 'ean8':
      return checkGtin(input, 8, 'An EAN-8')
    case 'itf14':
      return checkGtin(input, 14, 'An ITF-14 (GTIN-14)')
    case 'upce':
      return checkUpcE(input)
    case 'isbn':
      return checkIsbn(input)
    case 'code39':
      return checkCode39(input)
    case 'code128':
      return checkCode128(input)
    case 'fnsku':
      return checkFnsku(input)
    case 'gs1128':
      return checkGs1(input)
  }
}

/** Types that can carry an EAN-2/EAN-5 add-on. */
export const ADDON_TYPES: BarcodeType[] = ['ean13', 'upca', 'isbn']

/** Encodes a value already passed through checkBarcodeValue (and an add-on through checkAddon). */
export function encodeBarcode(
  type: BarcodeType,
  value: string,
  above?: string,
  addon?: string,
): Encoded {
  switch (type) {
    case 'ean13':
      return withAddon(encodeEan13(value), addon)
    case 'isbn':
      return withAddon({ ...encodeEan13(value), ...(above ? { above } : {}) }, addon)
    case 'upca':
      return withAddon(encodeUpcA(value), addon)
    case 'ean8':
      return encodeEan8(value)
    case 'upce':
      return encodeUpcE(value)
    case 'itf14':
      return encodeItf14(value)
    case 'code39':
      return encodeCode39(value)
    case 'code128':
    case 'fnsku':
      return encodeCode128(value)
    case 'gs1128': {
      const parsed = parseGs1(value)
      if (!parsed.ok) throw new Error(parsed.error)
      // Printed in its readable form, with the AIs in brackets.
      const enc = encodeCode128(gs1Data(parsed.elements))
      return { ...enc, text: [{ text: value, from: 0, to: enc.modules.length }] }
    }
  }
}
