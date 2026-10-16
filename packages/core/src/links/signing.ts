/**
 * HMAC-SHA256 request signing between the app and the edge-api Worker (and the dev scan sink).
 * Uses WebCrypto, so the same code runs in Node, browsers and Workers.
 */

export const SIGNATURE_HEADER = 'x-qrf-signature'
export const TIMESTAMP_HEADER = 'x-qrf-timestamp'
export const MAX_SKEW_SECONDS = 300

const enc = new TextEncoder()

const toHex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

export async function sha256Hex(data: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(data)))
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return toHex(await crypto.subtle.sign('HMAC', key, enc.encode(message)))
}

type Signable = { method: string; path: string; body: string; timestamp: number }

async function canonical(r: Signable): Promise<string> {
  return `${r.timestamp}\n${r.method.toUpperCase()}\n${r.path}\n${await sha256Hex(r.body)}`
}

export async function signRequest(secret: string, r: Signable): Promise<string> {
  return hmacHex(secret, await canonical(r))
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function verifyRequest(
  secret: string,
  r: Signable & { signature: string | null },
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!secret || !r.signature || !Number.isFinite(r.timestamp)) return false
  if (Math.abs(nowSeconds - r.timestamp) > MAX_SKEW_SECONDS) return false
  return timingSafeEqual(await signRequest(secret, r), r.signature)
}

/** Headers for a signed fetch. */
export async function signedHeaders(secret: string, method: string, path: string, body: string) {
  const timestamp = Math.floor(Date.now() / 1000)
  return {
    [TIMESTAMP_HEADER]: String(timestamp),
    [SIGNATURE_HEADER]: await signRequest(secret, { method, path, body, timestamp }),
  }
}
