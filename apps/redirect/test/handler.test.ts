import { DEFAULT_FIELDS } from '@qrfinity/core'
import { hashPassword, type LinkRecord } from '@qrfinity/core/edge'
import { describe, expect, it, vi } from 'vitest'
import { handleRequest, type RedirectDeps } from '../src/handler'

const rec = (patch: Partial<LinkRecord> = {}): LinkRecord => ({
  id: 'code-1',
  owner: 'user-1',
  dest: 'https://example.com/menu',
  status: 'active',
  v: 1,
  ...patch,
})

function setup(
  opts: {
    kv?: Record<string, LinkRecord>
    db?: Record<string, LinkRecord>
    noDb?: boolean
    throttled?: boolean
  } = {},
) {
  const kv = new Map(Object.entries(opts.kv ?? {}))
  const missing = new Set<string>()
  const pending: Promise<unknown>[] = []
  const deps: RedirectDeps = {
    defaultDomain: 'qrfinity.link',
    siteOrigin: 'https://qrfinity.com',
    getRecord: vi.fn(async (_d, s) => (kv.has(s) ? JSON.parse(JSON.stringify(kv.get(s))) : null)),
    putRecord: vi.fn(async (_d, s, r) => void kv.set(s, r)),
    isKnownMissing: vi.fn(async (_d, s) => missing.has(s)),
    rememberMissing: vi.fn(async (_d, s) => void missing.add(s)),
    lookupDatabase: opts.noDb ? undefined : vi.fn(async (_d, s) => opts.db?.[s] ?? null),
    allowFallback: vi.fn(async () => !opts.throttled),
    recordScan: vi.fn(async () => undefined),
    waitUntil: (p) => void pending.push(p),
  }
  const get = async (path: string, init?: RequestInit, cf?: { country?: string }) => {
    const req = new Request('https://qrfinity.link' + path, init)
    // Cloudflare adds request.cf; plain Node requests don't have it.
    if (cf) Object.defineProperty(req, 'cf', { value: cf })
    const res = await handleRequest(req, deps)
    await Promise.all(pending)
    return res
  }
  return { deps, kv, get }
}

describe('redirect worker', () => {
  it('302s an active code from KV and records the scan', async () => {
    const { get, deps } = setup({ kv: { aB3xK9q: rec() } })
    const res = await get('/aB3xK9q')
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://example.com/menu')
    expect(res.headers.get('x-robots-tag')).toContain('noindex')
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(deps.recordScan).toHaveBeenCalledOnce()
    expect(deps.lookupDatabase).not.toHaveBeenCalled()
  })

  it('falls back to Postgres on a KV miss and repopulates KV', async () => {
    const { get, kv, deps } = setup({ db: { aB3xK9q: rec({ dest: 'https://from-db.example' }) } })
    const res = await get('/aB3xK9q')
    expect(res.headers.get('location')).toBe('https://from-db.example')
    expect(kv.get('aB3xK9q')?.dest).toBe('https://from-db.example')
    await get('/aB3xK9q')
    expect(deps.lookupDatabase).toHaveBeenCalledOnce()
  })

  it('serves a friendly 404 and caches the miss', async () => {
    const { get, deps } = setup()
    const res = await get('/zzzzzzz')
    expect(res.status).toBe(404)
    expect(await res.text()).toContain('isn’t active')
    await get('/zzzzzzz')
    expect(deps.lookupDatabase).toHaveBeenCalledOnce()
  })

  it('never queries Postgres for malformed slugs or when throttled', async () => {
    const { get, deps } = setup({ throttled: true })
    expect((await get('/a/b/c')).status).toBe(404)
    expect((await get('/x')).status).toBe(404)
    expect((await get('/abcdefg')).status).toBe(404)
    expect(deps.lookupDatabase).not.toHaveBeenCalled()
  })

  it('shows a warning for disabled codes, never the destination', async () => {
    const { get, deps } = setup({ kv: { aB3xK9q: rec({ status: 'disabled' }) } })
    const res = await get('/aB3xK9q')
    expect(res.status).toBe(403)
    expect(res.headers.get('location')).toBeNull()
    const body = await res.text()
    expect(body).not.toContain('example.com/menu')
    expect(body).toContain('Report this QR code')
    expect(deps.recordScan).not.toHaveBeenCalled()
  })

  it('shows the paused page for paused codes', async () => {
    const { get } = setup({ kv: { aB3xK9q: rec({ status: 'paused' }) } })
    const res = await get('/aB3xK9q')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('paused')
  })

  it('ignores corrupt KV records and recovers from Postgres', async () => {
    const { get, kv } = setup({ db: { aB3xK9q: rec() } })
    kv.set('aB3xK9q', {
      id: 'x',
      dest: 'javascript:alert(1)',
      status: 'active',
      owner: 'u',
      v: 1,
    } as LinkRecord)
    const res = await get('/aB3xK9q')
    expect(res.headers.get('location')).toBe('https://example.com/menu')
  })

  it('does not record HEAD requests (link checkers)', async () => {
    const { get, deps } = setup({ kv: { aB3xK9q: rec() } })
    expect((await get('/aB3xK9q', { method: 'HEAD' })).status).toBe(302)
    expect(deps.recordScan).not.toHaveBeenCalled()
  })

  it('redirects the bare domain to the site, serves robots.txt, rejects POST', async () => {
    const { get } = setup()
    expect((await get('/')).headers.get('location')).toBe('https://qrfinity.com')
    expect(await (await get('/robots.txt')).text()).toContain('Allow: /')
    expect((await get('/aB3xK9q', { method: 'PUT' })).status).toBe(405)
    // POST is only for password forms: an unknown code is simply not found.
    expect((await get('/aB3xK9q', { method: 'POST' })).status).toBe(404)
  })

  it('works without a database configured', async () => {
    const { get } = setup({ noDb: true })
    expect((await get('/aB3xK9q')).status).toBe(404)
  })

  it('a failing scan write never breaks the redirect', async () => {
    const { get, deps } = setup({ kv: { aB3xK9q: rec() } })
    deps.recordScan = vi.fn(async () => {
      throw new Error('AE down')
    })
    expect((await get('/aB3xK9q')).status).toBe(302)
  })

  describe('redirect rules', () => {
    const IPHONE =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'
    const ANDROID =
      'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Mobile Safari/537.36'
    const withRules = rec({
      rules: [
        { name: '', when: { type: 'device', devices: ['ios'] }, dest: 'https://apps.apple.com/x' },
        {
          name: 'Play',
          when: { type: 'device', devices: ['android'] },
          dest: 'https://play.example',
        },
        { name: '', when: { type: 'country', countries: ['FR'] }, dest: 'https://fr.example' },
        {
          name: 'Lunch',
          when: { type: 'schedule', timezone: 'UTC', days: [5], from: '11:00', to: '15:00' },
          dest: 'https://lunch.example',
        },
      ],
    })

    it('sends each phone to its own store and records which rule matched', async () => {
      const { get, deps } = setup({ kv: { aB3xK9q: withRules } })
      const ios = await get('/aB3xK9q', { headers: { 'user-agent': IPHONE } })
      expect(ios.headers.get('location')).toBe('https://apps.apple.com/x')
      expect(deps.recordScan).toHaveBeenLastCalledWith(
        expect.any(Request),
        withRules,
        'iPhone and iPad',
      )
      const android = await get(
        '/aB3xK9q',
        { headers: { 'user-agent': ANDROID } },
        { country: 'FR' },
      )
      expect(android.headers.get('location')).toBe('https://play.example')
      expect(deps.recordScan).toHaveBeenLastCalledWith(expect.any(Request), withRules, 'Play')
    })

    it('uses the country, then the time, then the main destination', async () => {
      const { get, deps } = setup({ kv: { aB3xK9q: withRules } })
      deps.now = () => new Date('2026-10-16T12:00:00Z') // Friday noon UTC
      expect((await get('/aB3xK9q', undefined, { country: 'FR' })).headers.get('location')).toBe(
        'https://fr.example',
      )
      expect((await get('/aB3xK9q', undefined, { country: 'CA' })).headers.get('location')).toBe(
        'https://lunch.example',
      )
      deps.now = () => new Date('2026-10-16T18:00:00Z')
      expect((await get('/aB3xK9q', undefined, { country: 'CA' })).headers.get('location')).toBe(
        'https://example.com/menu',
      )
      expect(deps.recordScan).toHaveBeenLastCalledWith(expect.any(Request), withRules, '')
    })

    it('ignores a malformed rule instead of failing the scan', async () => {
      const broken = { ...withRules, rules: [{ name: '', when: { type: '?' }, dest: 'https://x' }] }
      const { get } = setup({ kv: { aB3xK9q: broken as unknown as LinkRecord } })
      const res = await get('/aB3xK9q', { headers: { 'user-agent': IPHONE } })
      expect(res.status).toBe(302)
      expect(res.headers.get('location')).toBe('https://example.com/menu')
    })
  })

  describe('contact cards', () => {
    const card = rec({
      dest: '',
      page: {
        type: 'vcard',
        fields: {
          firstName: 'Jane',
          lastName: 'Doe <b>',
          organization: 'Acme',
          title: 'Owner',
          mobile: '+1 (416) 555-0100',
          workPhone: '',
          email: 'jane@acme.example',
          website: 'acme.example',
          street: '',
          city: 'Toronto',
          region: 'ON',
          postalCode: '',
          country: 'Canada',
          note: 'Call after 9',
        },
      },
    })

    it('shows the contact page, escaped, and counts it as a scan', async () => {
      const { get, deps } = setup({ kv: { aB3xK9q: card } })
      const res = await get('/aB3xK9q')
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain('text/html')
      const body = await res.text()
      expect(body).toContain('Jane Doe &lt;b&gt;')
      expect(body).not.toContain('<b>')
      expect(body).toContain('href="/aB3xK9q.vcf"')
      expect(body).toContain('href="tel:+14165550100"')
      expect(body).toContain('href="mailto:jane@acme.example"')
      expect(body).toContain('href="https://acme.example/"')
      expect(body).toContain('Report this page')
      expect(deps.recordScan).toHaveBeenCalledOnce()
    })

    it('serves the .vcf without counting another scan', async () => {
      const { get, deps } = setup({ kv: { aB3xK9q: card } })
      const res = await get('/aB3xK9q.vcf')
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('text/vcard; charset=utf-8')
      expect(res.headers.get('content-disposition')).toBe('inline; filename="jane-doe-b.vcf"')
      const vcf = await res.text()
      expect(vcf).toContain('FN:Jane Doe <b>\r\n')
      expect(vcf).toContain('TEL;TYPE=CELL:+14165550100')
      expect(deps.recordScan).not.toHaveBeenCalled()
    })

    it('gives a .vcf only for contact cards, and respects pause and disable', async () => {
      const { get } = setup({ kv: { aB3xK9q: rec(), pause01: { ...card, status: 'paused' } } })
      expect((await get('/aB3xK9q.vcf')).status).toBe(404)
      const paused = await get('/pause01')
      expect(await paused.text()).not.toContain('Save contact')
    })
  })

  describe('password protection', () => {
    const post = (password: string) => ({
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ password }).toString(),
    })

    it('asks for the password, counts the scan, then redirects on the right one', async () => {
      const lock = await hashPassword('menu2026')
      const { get, deps } = setup({ kv: { aB3xK9q: rec({ lock }) } })
      const ask = await get('/aB3xK9q')
      expect(ask.status).toBe(200)
      const html = await ask.text()
      expect(html).toContain('This QR code is protected')
      expect(html).toContain('<form method="post" action="/aB3xK9q">')
      expect(html).not.toContain('example.com/menu')
      expect(deps.recordScan).toHaveBeenCalledOnce()

      const wrong = await get('/aB3xK9q', post('nope'))
      expect(wrong.status).toBe(401)
      expect(await wrong.text()).toContain('That password isn’t right')

      const right = await get('/aB3xK9q', post('menu2026'))
      expect(right.status).toBe(303)
      expect(right.headers.get('location')).toBe('https://example.com/menu')
      expect(right.headers.get('set-cookie')).toBeNull()
      expect(deps.recordScan).toHaveBeenCalledOnce()
    })

    it('applies redirect rules after unlocking', async () => {
      const lock = await hashPassword('menu2026')
      const record = rec({
        lock,
        rules: [
          { name: '', when: { type: 'country', countries: ['FR'] }, dest: 'https://fr.example' },
        ],
      })
      const { get } = setup({ kv: { aB3xK9q: record } })
      const res = await get('/aB3xK9q', post('menu2026'), { country: 'FR' })
      expect(res.headers.get('location')).toBe('https://fr.example')
    })

    it('shows a protected contact card and lets the visitor save it without asking again', async () => {
      const lock = await hashPassword('team')
      const card = rec({
        dest: '',
        lock,
        page: {
          type: 'vcard',
          fields: { ...DEFAULT_FIELDS.vcard, firstName: 'Jane', lastName: 'Doe' },
        },
      })
      const { get } = setup({ kv: { aB3xK9q: card } })
      expect(await (await get('/aB3xK9q.vcf')).text()).toContain('This QR code is protected')
      const page = await (await get('/aB3xK9q', post('team'))).text()
      expect(page).toContain('<h1>Jane Doe</h1>')
      expect(page).toContain(
        'action="/aB3xK9q.vcf"><input type="hidden" name="password" value="team">',
      )
      const vcf = await get('/aB3xK9q.vcf', post('team'))
      expect(vcf.headers.get('content-type')).toBe('text/vcard; charset=utf-8')
    })

    it('slows down guessing and refuses POST on open codes', async () => {
      const lock = await hashPassword('menu2026')
      const { get, deps } = setup({ kv: { aB3xK9q: rec({ lock }), open123: rec() } })
      deps.allowUnlock = async () => false
      const res = await get('/aB3xK9q', post('menu2026'))
      expect(res.status).toBe(429)
      expect(await res.text()).toContain('Too many tries')
      expect((await get('/open123', post('x'))).status).toBe(405)
    })
  })
})
