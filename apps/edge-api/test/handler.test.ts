import { linkKey, signRequest } from '@qrfinity/core/edge'
import { describe, expect, it } from 'vitest'
import { handleEdgeApi, prepareTomorrowsSalt, type KvLike } from '../src/handler'

const SECRET = 'test-secret'
const NOW = 1_800_000_000

function memoryKv() {
  const m = new Map<string, { value: string; ttl?: number }>()
  const kv: KvLike = {
    get: async (k) => m.get(k)?.value ?? null,
    put: async (k, value, o) => void m.set(k, { value, ttl: o?.expirationTtl }),
    delete: async (k) => void m.delete(k),
  }
  return { kv, m }
}

async function call(
  kv: KvLike,
  method: string,
  path: string,
  body = '',
  opts: { secret?: string; ts?: number } = {},
) {
  const ts = opts.ts ?? NOW
  const sig = await signRequest(opts.secret ?? SECRET, { method, path, body, timestamp: ts })
  const req = new Request('https://edge.qrfinity.link' + path, {
    method,
    body: method === 'GET' ? undefined : body,
    headers: { 'x-qrf-timestamp': String(ts), 'x-qrf-signature': sig },
  })
  return handleEdgeApi(req, kv, SECRET, NOW)
}

const record = (v: number, dest = 'https://example.com') =>
  JSON.stringify({ id: 'c1', owner: 'u1', dest, status: 'active', v })

describe('edge-api', () => {
  it('stores a signed record', async () => {
    const { kv, m } = memoryKv()
    const res = await call(kv, 'PUT', '/v1/links/qrfinity.link/aB3xK9q', record(1))
    expect(res.status).toBe(200)
    expect(JSON.parse(m.get(linkKey('qrfinity.link', 'aB3xK9q'))!.value).dest).toBe(
      'https://example.com',
    )
  })
  it('keeps a newer version over a delayed older write', async () => {
    const { kv, m } = memoryKv()
    await call(kv, 'PUT', '/v1/links/qrfinity.link/aB3xK9q', record(5, 'https://new.example'))
    await call(kv, 'PUT', '/v1/links/qrfinity.link/aB3xK9q', record(4, 'https://old.example'))
    expect(JSON.parse(m.get(linkKey('qrfinity.link', 'aB3xK9q'))!.value).dest).toBe(
      'https://new.example',
    )
  })
  it('deletes a record', async () => {
    const { kv, m } = memoryKv()
    await call(kv, 'PUT', '/v1/links/qrfinity.link/aB3xK9q', record(1))
    expect((await call(kv, 'DELETE', '/v1/links/qrfinity.link/aB3xK9q')).status).toBe(200)
    expect(m.size).toBe(0)
  })
  it('rejects unsigned, wrongly signed and stale requests', async () => {
    const { kv } = memoryKv()
    expect(
      (
        await handleEdgeApi(
          new Request('https://e/v1/links/qrfinity.link/aB3xK9q', {
            method: 'PUT',
            body: record(1),
          }),
          kv,
          SECRET,
          NOW,
        )
      ).status,
    ).toBe(401)
    expect(
      (await call(kv, 'PUT', '/v1/links/qrfinity.link/aB3xK9q', record(1), { secret: 'wrong' }))
        .status,
    ).toBe(401)
    expect(
      (await call(kv, 'PUT', '/v1/links/qrfinity.link/aB3xK9q', record(1), { ts: NOW - 600 }))
        .status,
    ).toBe(401)
  })
  it('validates slugs and records', async () => {
    const { kv } = memoryKv()
    expect((await call(kv, 'PUT', '/v1/links/qrfinity.link/bad!slug', record(1))).status).toBe(400)
    expect(
      (await call(kv, 'PUT', '/v1/links/qrfinity.link/aB3xK9q', '{"dest":"javascript:x"}')).status,
    ).toBe(400)
    expect((await call(kv, 'PUT', '/v1/links/qrfinity.link/aB3xK9q', 'not json')).status).toBe(400)
  })
  it('answers health checks without a signature', async () => {
    const { kv } = memoryKv()
    expect((await handleEdgeApi(new Request('https://e/v1/health'), kv, SECRET)).status).toBe(200)
  })
  it('prepares tomorrow’s salt once, with an expiry', async () => {
    const { kv, m } = memoryKv()
    const key = await prepareTomorrowsSalt(kv, new Date('2026-10-15T23:50:00Z'))
    expect(key).toBe('salt:2026-10-16')
    const first = m.get(key)!
    expect(first.ttl).toBe(36 * 3600)
    await prepareTomorrowsSalt(kv, new Date('2026-10-15T23:55:00Z'))
    expect(m.get(key)!.value).toBe(first.value)
  })
})
