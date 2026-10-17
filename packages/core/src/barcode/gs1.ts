/**
 * GS1 element strings for GS1-128: "(01)09501101530003(17)250101(10)ABC123". Each element is an
 * application identifier (AI) in brackets and its data. Common AIs only; each is checked for
 * length, digits, dates and check digits so a label isn't printed with an unreadable field.
 */
import { FNC1, gtinCheckDigit } from './encode'

type AiSpec = {
  /** Fixed data length, or the maximum for variable-length data. */
  length: number
  fixed: boolean
  numeric: boolean
  /** The last digit is a GS1 check digit. */
  check?: boolean
  /** YYMMDD (DD may be 00). */
  date?: boolean
  name: string
}

const n = (length: number, name: string, extra: Partial<AiSpec> = {}): AiSpec => ({
  length,
  fixed: true,
  numeric: true,
  name,
  ...extra,
})
const v = (length: number, name: string, numeric = false): AiSpec => ({
  length,
  fixed: false,
  numeric,
  name,
})

const AIS: Record<string, AiSpec> = {
  '00': n(18, 'SSCC (shipping container code)', { check: true }),
  '01': n(14, 'GTIN', { check: true }),
  '02': n(14, 'GTIN of contained items', { check: true }),
  '10': v(20, 'Batch or lot number'),
  '11': n(6, 'Production date', { date: true }),
  '12': n(6, 'Due date', { date: true }),
  '13': n(6, 'Packaging date', { date: true }),
  '15': n(6, 'Best before date', { date: true }),
  '16': n(6, 'Sell by date', { date: true }),
  '17': n(6, 'Expiry date', { date: true }),
  '20': n(2, 'Product variant'),
  '21': v(20, 'Serial number'),
  '22': v(20, 'Consumer product variant'),
  '30': v(8, 'Count of items', true),
  '37': v(8, 'Count of trade items', true),
  '240': v(30, 'Additional product identification'),
  '241': v(30, 'Customer part number'),
  '250': v(30, 'Secondary serial number'),
  '251': v(30, 'Reference to source entity'),
  '400': v(30, 'Customer purchase order number'),
  '401': v(30, 'Consignment number'),
  '402': n(17, 'Shipment identification number', { check: true }),
  '403': v(30, 'Routing code'),
  '410': n(13, 'Ship to (GLN)', { check: true }),
  '411': n(13, 'Bill to (GLN)', { check: true }),
  '412': n(13, 'Purchased from (GLN)', { check: true }),
  '413': n(13, 'Ship for (GLN)', { check: true }),
  '414': n(13, 'Location (GLN)', { check: true }),
  '415': n(13, 'Invoicing party (GLN)', { check: true }),
  '420': v(20, 'Ship to postal code'),
  '422': n(3, 'Country of origin'),
  '7003': n(10, 'Expiry date and time'),
  '8008': v(12, 'Production date and time', true),
  '90': v(30, 'Internal'),
  '91': v(90, 'Company internal'),
  '92': v(90, 'Company internal'),
  '93': v(90, 'Company internal'),
  '94': v(90, 'Company internal'),
  '95': v(90, 'Company internal'),
  '96': v(90, 'Company internal'),
  '97': v(90, 'Company internal'),
  '98': v(90, 'Company internal'),
  '99': v(90, 'Company internal'),
}

/** Measures with 4-digit AIs 310n–369n (weights, lengths, volumes): 6 digits, n = decimal places. */
function specFor(ai: string): AiSpec | undefined {
  if (/^3[1-6]\d\d$/.test(ai)) return n(6, 'Measure')
  return AIS[ai]
}

export type Gs1Element = { ai: string; data: string }

/** GS1's character set 82: letters, digits and a few symbols. */
const CSET82 = /^[!"%&'()*+,\-./0-9:;<=>?A-Z_a-z]*$/

function validDate(s: string) {
  const mm = Number(s.slice(2, 4))
  const dd = Number(s.slice(4, 6))
  return mm >= 1 && mm <= 12 && dd >= 0 && dd <= 31
}

/** Parses and checks "(AI)data(AI)data…". Returns the elements, or a message saying what to fix. */
export function parseGs1(
  input: string,
): { ok: true; elements: Gs1Element[] } | { ok: false; error: string } {
  const s = input.trim()
  if (!s.startsWith('('))
    return {
      ok: false,
      error: 'Write each field as (AI) then its data, like (01)09501101530003(10)LOT42.',
    }
  const re = /\((\d{2,4})\)([^(]*)/g
  const elements: Gs1Element[] = []
  let consumed = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(s))) {
    if (m.index !== consumed) break
    consumed = re.lastIndex
    const ai = m[1]!
    const data = m[2]!.trim()
    const spec = specFor(ai)
    if (!spec)
      return {
        ok: false,
        error: `(${ai}) isn’t a supported application identifier. Check the number.`,
      }
    if (!data) return { ok: false, error: `(${ai}) ${spec.name} needs data after it.` }
    if (spec.numeric && !/^\d+$/.test(data))
      return { ok: false, error: `(${ai}) ${spec.name} takes digits only.` }
    if (!spec.numeric && !CSET82.test(data))
      return {
        ok: false,
        error: `(${ai}) ${spec.name} can’t contain spaces or accented letters; use letters, digits and - . / _`,
      }
    if (spec.fixed && data.length !== spec.length) {
      // Fixed-length fields with a check digit: accept them without it and add it.
      if (spec.check && data.length === spec.length - 1) {
        elements.push({ ai, data: data + gtinCheckDigit(data) })
        continue
      }
      return { ok: false, error: `(${ai}) ${spec.name} has exactly ${spec.length} digits.` }
    }
    if (!spec.fixed && data.length > spec.length)
      return { ok: false, error: `(${ai}) ${spec.name} is at most ${spec.length} characters.` }
    if (spec.check) {
      const expected = gtinCheckDigit(data.slice(0, -1))
      if (Number(data.at(-1)) !== expected)
        return {
          ok: false,
          error: `(${ai}) ${spec.name}: the last digit should be ${expected}, its check digit.`,
        }
    }
    if (spec.date && !validDate(data))
      return { ok: false, error: `(${ai}) ${spec.name} is a date written YYMMDD, like 251231.` }
    elements.push({ ai, data })
  }
  if (consumed !== s.length || !elements.length)
    return {
      ok: false,
      error: 'Write each field as (AI) then its data, like (01)09501101530003(10)LOT42.',
    }
  // GS1-128 holds at most 48 characters of data (FNC1 separators not counted).
  if (gs1Data(elements).replaceAll(FNC1, '').length > 48)
    return {
      ok: false,
      error: 'That’s more than one GS1-128 barcode holds (48 characters). Split it into two.',
    }
  return { ok: true, elements }
}

/** Human-readable form, as printed under the bars. */
export const gs1Text = (elements: Gs1Element[]) =>
  elements.map((e) => `(${e.ai})${e.data}`).join('')

/** The Code 128 input: FNC1 first, then each element, with FNC1 after variable-length ones (except the last). */
export function gs1Data(elements: Gs1Element[]): string {
  let out = FNC1
  elements.forEach((e, i) => {
    out += e.ai + e.data
    if (!specFor(e.ai)!.fixed && i < elements.length - 1) out += FNC1
  })
  return out
}
