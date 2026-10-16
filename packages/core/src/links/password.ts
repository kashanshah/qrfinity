/**
 * Password protection for dynamic codes (an advanced feature). Only a salted PBKDF2-SHA256 hash is
 * stored, in Postgres and in the edge record; the redirect Worker checks a typed password against
 * it. WebCrypto only, so the same code runs in Node and Workers.
 *
 * 10,000 iterations keeps a check within the Worker's CPU budget (10 ms on the free plan). The hash
 * never leaves our systems, and wrong guesses are rate-limited per visitor and code.
 */

export const PASSWORD_MIN = 4
export const PASSWORD_MAX = 64
export const PBKDF2_ITERATIONS = 10_000

const PREFIX = 'pbkdf2-sha256'
const HASH_RE = /^pbkdf2-sha256\$(\d{4,7})\$([A-Za-z0-9_-]{16,64})\$([A-Za-z0-9_-]{43})$/

const enc = new TextEncoder()

function toB64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    256,
  )
  return new Uint8Array(bits)
}

/** Checks what the owner typed. Spaces at the ends are kept: they're part of the password. */
export function checkPassword(
  input: unknown,
): { ok: true; password: string } | { ok: false; error: string } {
  if (typeof input !== 'string' || input.length < PASSWORD_MIN)
    return { ok: false, error: `Use at least ${PASSWORD_MIN} characters.` }
  if (input.length > PASSWORD_MAX)
    return { ok: false, error: `Use at most ${PASSWORD_MAX} characters.` }
  return { ok: true, password: input }
}

export function isPasswordHash(value: unknown): value is string {
  return typeof value === 'string' && HASH_RE.test(value)
}

export async function hashPassword(password: string, iterations = PBKDF2_ITERATIONS) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await derive(password, salt, iterations)
  return `${PREFIX}$${iterations}$${toB64url(salt)}$${toB64url(hash)}`
}

/** True when `password` matches the stored hash. Compares in constant time. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const m = HASH_RE.exec(stored)
  if (!m || password.length > PASSWORD_MAX) return false
  const expected = fromB64url(m[3]!)
  const actual = await derive(password, fromB64url(m[2]!), Number(m[1]))
  if (actual.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < actual.length; i++) diff |= actual[i]! ^ expected[i]!
  return diff === 0
}
