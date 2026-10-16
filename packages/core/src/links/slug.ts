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

/** Random slugs (6–8 base62) or custom ones (see CUSTOM_SLUG_RE). The redirect accepts both. */
export function isValidSlug(value: string): boolean {
  return SLUG_RE.test(value) || CUSTOM_SLUG_RE.test(value)
}

// ---------------------------------------------------------------------------
// Custom slugs: chosen by the owner, e.g. qrfinity.link/joes-menu

/** 4–40 characters: lowercase letters, digits and single hyphens, not starting or ending with one. */
export const CUSTOM_SLUG_RE = /^(?=.{4,40}$)[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Paths we keep for ourselves or that look official. */
const RESERVED = new Set([
  'about',
  'abuse',
  'account',
  'admin',
  'api',
  'app',
  'assets',
  'billing',
  'blog',
  'contact',
  'dashboard',
  'docs',
  'edge',
  'help',
  'home',
  'info',
  'legal',
  'login',
  'logout',
  'mail',
  'official',
  'pricing',
  'privacy',
  'qrfinity',
  'report',
  'security',
  'settings',
  'signin',
  'signout',
  'signup',
  'static',
  'status',
  'support',
  'terms',
  'test',
  'www',
])

/**
 * Brands, banks and words phishing pages lean on. A custom link like qrfinity.link/paypal-login
 * would lend our domain to a scam, so these are refused outright. Short names match whole
 * hyphen-separated words only ("td" blocks "td-bank", not "studio"); longer ones match anywhere.
 */
const IMPERSONATION = [
  'paypal',
  'venmo',
  'zelle',
  'cashapp',
  'interac',
  'stripe',
  'square',
  'visa',
  'mastercard',
  'amex',
  'apple',
  'appleid',
  'icloud',
  'google',
  'gmail',
  'microsoft',
  'outlook',
  'office365',
  'amazon',
  'netflix',
  'facebook',
  'instagram',
  'whatsapp',
  'meta',
  'tiktok',
  'linkedin',
  'twitter',
  'telegram',
  'coinbase',
  'binance',
  'metamask',
  'crypto',
  'wallet',
  'bitcoin',
  'bank',
  'banking',
  'chase',
  'wellsfargo',
  'citi',
  'hsbc',
  'barclays',
  'rbc',
  'td',
  'bmo',
  'cibc',
  'scotiabank',
  'desjardins',
  'tangerine',
  'irs',
  'cra',
  'gov',
  'government',
  'police',
  'tax',
  'refund',
  'usps',
  'fedex',
  'ups',
  'dhl',
  'canadapost',
  'purolator',
  'verify',
  'verification',
  'password',
  'secure',
  'unlock',
  'suspended',
  'invoice',
  'payment',
]

export type CustomSlugCheck = { ok: true; slug: string } | { ok: false; error: string }

/** Normalises and checks a requested custom slug. Uniqueness is checked by the database. */
export function checkCustomSlug(input: string): CustomSlugCheck {
  const slug = input.trim().toLowerCase().replace(/\s+/g, '-')
  if (!CUSTOM_SLUG_RE.test(slug))
    return {
      ok: false,
      error: 'Use 4 to 40 lowercase letters, numbers and single hyphens, like joes-menu.',
    }
  if (RESERVED.has(slug) || isBlockedSlug(slug))
    return { ok: false, error: 'That short link isn’t available.' }
  const words = slug.split('-')
  const looksOfficial = IMPERSONATION.some((w) =>
    w.length >= 5 ? slug.replace(/-/g, '').includes(w) : words.includes(w),
  )
  if (looksOfficial)
    return {
      ok: false,
      error:
        'Short links can’t include bank, payment or big-brand names, to keep scanners safe from look-alike scams.',
    }
  return { ok: true, slug }
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
