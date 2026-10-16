import { describe, expect, it } from 'vitest'
import {
  SLUG_ALPHABET,
  generateSlug,
  isBlockedSlug,
  isValidSlug,
  linkKey,
  parseLinkRecord,
  shortLinkUrl,
  signRequest,
  signedHeaders,
  validateDestination,
  verifyRequest,
} from '../src'

describe('slugs', () => {
  it('are 7 base62 characters by default', () => {
    for (let i = 0; i < 200; i++) {
      const s = generateSlug()
      expect(s).toMatch(/^[0-9A-Za-z]{7}$/)
      expect(isValidSlug(s)).toBe(true)
    }
  })
  it('discard biased bytes (248–255)', () => {
    const bytes = [255, 250, 248, 0, 61, 62, 247]
    let i = 0
    const slug = generateSlug(4, (n) =>
      Uint8Array.from({ length: n }, () => bytes[i++ % bytes.length]!),
    )
    expect(slug).toBe('0z0' + SLUG_ALPHABET[247 % 62])
  })
  it('skip blocked words', () => {
    const codes = (w: string) => Uint8Array.from([...w].map((c) => SLUG_ALPHABET.indexOf(c)))
    let call = 0
    expect(isBlockedSlug('xFuCkxx')).toBe(true)
    expect(generateSlug(7, () => (call++ === 0 ? codes('xfuckxx') : codes('abcdefg')))).toBe(
      'abcdefg',
    )
  })
  it('validate format', () => {
    expect(isValidSlug('abc')).toBe(false)
    expect(isValidSlug('abc123')).toBe(true)
    expect(isValidSlug('AbCdEfGhI')).toBe(false) // too long for a random slug, uppercase for a custom one
    expect(isValidSlug('Abc-123')).toBe(false)
    // Custom slugs: lowercase with hyphens.
    expect(isValidSlug('abc-123')).toBe(true)
    expect(isValidSlug('abcdefghi')).toBe(true)
  })
  it('are distinct across many draws', () => {
    const seen = new Set(Array.from({ length: 5000 }, () => generateSlug()))
    expect(seen.size).toBe(5000)
  })
})

describe('destination validation', () => {
  it('accepts normal web addresses and adds https', () => {
    expect(validateDestination('example.com/menu')).toEqual({
      ok: true,
      url: 'https://example.com/menu',
    })
  })
  it.each([
    ['', 'Enter the web address'],
    ['javascript:alert(1)', 'full web address'],
    ['data:text/html;base64,xx', 'full web address'],
    ['http://192.168.0.1/admin', 'IP address'],
    ['http://[::1]/', 'full web address'],
    ['https://user:pw@example.com', 'user name or password'],
    ['http://printer.local', 'private network'],
    ['https://qrfinity.link/abc1234', 'another QRfinity short link'],
    ['https://example.com/' + 'a'.repeat(2100), 'too long'],
  ])('rejects %s', (input, message) => {
    const r = validateDestination(input)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toContain(message)
  })
})

describe('link records', () => {
  const rec = { id: 'c1', dest: 'https://example.com', status: 'active', owner: 'u1', v: 3 }
  it('round-trips and validates', () => {
    expect(parseLinkRecord(JSON.parse(JSON.stringify(rec)))).toEqual(rec)
    expect(parseLinkRecord({ ...rec, status: 'weird' })).toBeNull()
    expect(parseLinkRecord({ ...rec, dest: 'javascript:alert(1)' })).toBeNull()
    expect(parseLinkRecord({ ...rec, dest: 'javascript:x', status: 'disabled' })).not.toBeNull()
    expect(parseLinkRecord(null)).toBeNull()
  })
  it('builds keys and short links', () => {
    expect(linkKey('QRfinity.link', 'aB3xK9q')).toBe('l:qrfinity.link:aB3xK9q')
    expect(shortLinkUrl('qrfinity.link', 'aB3xK9q')).toBe('https://qrfinity.link/aB3xK9q')
    expect(shortLinkUrl('qrfinity.link', 'aB3xK9q', 'http://localhost:8787')).toBe(
      'http://localhost:8787/aB3xK9q',
    )
  })
})

describe('request signing', () => {
  const r = { method: 'POST', path: '/v1/links', body: '{"a":1}', timestamp: 1_800_000_000 }
  it('verifies a correct signature', async () => {
    const signature = await signRequest('s3cret', r)
    expect(await verifyRequest('s3cret', { ...r, signature }, r.timestamp + 10)).toBe(true)
  })
  it('rejects tampering, wrong secrets, missing or stale signatures', async () => {
    const signature = await signRequest('s3cret', r)
    expect(await verifyRequest('s3cret', { ...r, body: '{"a":2}', signature }, r.timestamp)).toBe(
      false,
    )
    expect(await verifyRequest('other', { ...r, signature }, r.timestamp)).toBe(false)
    expect(await verifyRequest('s3cret', { ...r, signature: null }, r.timestamp)).toBe(false)
    expect(await verifyRequest('s3cret', { ...r, signature }, r.timestamp + 301)).toBe(false)
    expect(await verifyRequest('', { ...r, signature }, r.timestamp)).toBe(false)
  })
  it('produces headers that verify', async () => {
    const h = await signedHeaders('k', 'DELETE', '/v1/links/x', '')
    expect(
      await verifyRequest('k', {
        method: 'DELETE',
        path: '/v1/links/x',
        body: '',
        timestamp: Number(h['x-qrf-timestamp']),
        signature: h['x-qrf-signature']!,
      }),
    ).toBe(true)
  })
})

describe('custom slugs', () => {
  it('accepts plain lowercase names and normalises input', async () => {
    const { checkCustomSlug, isValidSlug } = await import('../src/links/slug')
    expect(checkCustomSlug(' Joes Menu ')).toEqual({ ok: true, slug: 'joes-menu' })
    expect(checkCustomSlug('cafe2026')).toEqual({ ok: true, slug: 'cafe2026' })
    expect(isValidSlug('joes-menu')).toBe(true)
    expect(isValidSlug('aB3xK9q')).toBe(true)
  })

  it('refuses bad shapes, reserved words, offensive words and look-alike brands', async () => {
    const { checkCustomSlug, isValidSlug } = await import('../src/links/slug')
    for (const bad of ['abc', '-menu', 'menu-', 'me--nu', 'a'.repeat(41), 'menu_1', 'menu.pdf'])
      expect(checkCustomSlug(bad).ok, bad).toBe(false)
    for (const bad of [
      'admin',
      'login',
      'report',
      'paypal-login',
      'apple-id',
      'td-bank',
      'my-wallet',
      'irs-refund',
      'mypaypal',
    ])
      expect(checkCustomSlug(bad).ok, bad).toBe(false)
    // Short brand names match whole words only.
    for (const ok of ['studio-menu', 'citizen-cafe', 'upstairs-bar'])
      expect(checkCustomSlug(ok).ok, ok).toBe(true)
    expect(isValidSlug('../etc')).toBe(false)
  })
})
