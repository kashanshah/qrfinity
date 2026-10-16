/** Short-link slugs: random base62, 7 characters by default (about 3.5 trillion combinations). */

export const SLUG_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
export const SLUG_LENGTH = 7
const SLUG_RE = /^[0-9A-Za-z]{6,8}$/

// Substrings we never hand out, checked case-insensitively. Kept short on purpose.
const BLOCKED = [
  'fuck',
  'shit',
  'cunt',
  'dick',
  'cock',
  'piss',
  'slut',
  'whore',
  'fag',
  'nazi',
  'rape',
  'porn',
  'nigg',
  'kkk',
  'anal',
  'twat',
]

export function isValidSlug(value: string): boolean {
  return SLUG_RE.test(value)
}

export function isBlockedSlug(slug: string): boolean {
  const lower = slug.toLowerCase()
  return BLOCKED.some((w) => lower.includes(w))
}

/**
 * Generates a slug with rejection sampling, so every character is equally likely.
 * `randomBytes` is injectable for tests.
 */
export function generateSlug(
  length = SLUG_LENGTH,
  randomBytes: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n)),
): string {
  // 62 * 4 = 248: bytes 248–255 are discarded to avoid modulo bias.
  const limit = 248
  for (;;) {
    let out = ''
    while (out.length < length) {
      for (const b of randomBytes(length * 2)) {
        if (b < limit) out += SLUG_ALPHABET[b % 62]
        if (out.length === length) break
      }
    }
    if (!isBlockedSlug(out)) return out
  }
}
