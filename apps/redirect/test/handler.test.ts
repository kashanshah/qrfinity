import type { LinkRecord } from '@qrfinity/core/edge'
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
  const get = async (path: string, init?: RequestInit) => {
    const res = await handleRequest(new Request('https://qrfinity.link' + path, init), deps)
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
    expect((await get('/aB3xK9q', { method: 'POST' })).status).toBe(405)
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
})
