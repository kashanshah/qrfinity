/** Colour helpers: hex parsing and WCAG relative luminance / contrast. */

export type Rgb = { r: number; g: number; b: number }

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i

export function isHexColor(value: string): boolean {
  return HEX.test(value.trim())
}

/** Parses #rgb or #rrggbb. Invalid input returns black so rendering never throws. */
export function parseHex(value: string): Rgb {
  const m = HEX.exec(value.trim())
  if (!m) return { r: 0, g: 0, b: 0 }
  let hex = m[1]!
  if (hex.length === 3) hex = [...hex].map((c) => c + c).join('')
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  }
}

/** Normalises to lowercase #rrggbb. */
export function normalizeHex(value: string): string {
  const { r, g, b } = parseHex(value)
  return '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')
}

function channel(c: number): number {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

export function luminance(hex: string): number {
  const { r, g, b } = parseHex(hex)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** WCAG contrast ratio, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}
