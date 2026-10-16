import { lookup as dnsLookup } from 'node:dns'
import http from 'node:http'
import type { AddressInfo, LookupFunction } from 'node:net'
import zlib from 'node:zlib'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { checkLink, isPublicAddress, safeLookup } from '@/lib/server/link-check'

// The test server is on 127.0.0.1, which the real resolver refuses: these tests use the plain one.
const local = { lookup: dnsLookup as unknown as LookupFunction, anyPort: true }

let base = ''
const server = http.createServer((req, res) => {
  const path = req.url ?? '/'
  if (path === '/ok')
    return res.writeHead(200, { 'Content-Type': 'text/html' }).end('<h1>Menu</h1>')
  if (path === '/hop1') return res.writeHead(301, { Location: '/hop2' }).end()
  if (path === '/hop2') return res.writeHead(302, { Location: `${base}/ok` }).end()
  if (path === '/gone') return res.writeHead(404).end('nope')
  if (path === '/bot-wall') return res.writeHead(403).end('no bots')
  if (path === '/loop') return res.writeHead(302, { Location: '/loop' }).end()
  if (path === '/off') {
    res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Encoding': 'gzip' })
    return res.end(
      zlib.gzipSync('<html><body><p>Sorry, this QR code has been deactivated.</p></body></html>'),
    )
  }
  if (path === '/account/expired')
    return res.writeHead(200, { 'Content-Type': 'text/html' }).end('Hi')
  res.writeHead(500).end()
})

beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => new Promise<void>((r) => server.close(() => r())))

describe('checkLink', () => {
  it('follows redirects to a working page and lists each step', async () => {
    const r = await checkLink(`${base}/hop1`, local)
    expect(r).toMatchObject({ outcome: 'works', finalUrl: `${base}/ok`, status: 200 })
    expect(r.outcome === 'works' && r.hops.map((h) => h.status)).toEqual([301, 302, 200])
  })

  it('tells broken links from sites that only refuse bots', async () => {
    expect(await checkLink(`${base}/gone`, local)).toMatchObject({ outcome: 'broken', status: 404 })
    expect(await checkLink(`${base}/bot-wall`, local)).toMatchObject({
      outcome: 'uncertain',
      status: 403,
    })
  })

  it('spots a "deactivated" page that still answers 200, compressed or by its address', async () => {
    expect(await checkLink(`${base}/off`, local)).toMatchObject({
      outcome: 'deactivated',
      evidence: 'QR code has been deactivated',
    })
    expect(await checkLink(`${base}/account/expired`, local)).toMatchObject({
      outcome: 'deactivated',
    })
  })

  it('gives up on redirect loops', async () => {
    expect(await checkLink(`${base}/loop`, local)).toMatchObject({
      outcome: 'unreachable',
      reason: 'too-many-redirects',
    })
  })

  it('refuses private addresses, odd ports and anything that is not a web link', async () => {
    // The real resolver: localhost is 127.0.0.1 (or ::1), so it is never contacted.
    expect(await checkLink('http://localhost/')).toEqual({
      outcome: 'not-checked',
      reason: 'private-address',
    })
    expect(await checkLink(`${base}/ok`)).toEqual({
      outcome: 'not-checked',
      reason: 'unusual-port',
    })
    expect(await checkLink('ftp://example.com/x')).toEqual({
      outcome: 'not-checked',
      reason: 'not-a-web-link',
    })
    expect(await checkLink('not a url')).toEqual({
      outcome: 'not-checked',
      reason: 'not-a-web-link',
    })
  })

  it('reports names that do not resolve', async () => {
    expect(await checkLink('http://does-not-exist.invalid/', local)).toMatchObject({
      outcome: 'unreachable',
      reason: 'dns',
    })
  })
})

describe('isPublicAddress', () => {
  it.each([
    ['8.8.8.8', true],
    ['2606:4700::1111', true],
    ['127.0.0.1', false],
    ['10.1.2.3', false],
    ['172.20.0.1', false],
    ['192.168.1.1', false],
    ['169.254.169.254', false],
    ['100.64.0.1', false],
    ['0.0.0.0', false],
    ['::1', false],
    ['fd00::1', false],
    ['fe80::1', false],
    ['::ffff:127.0.0.1', false],
    ['::ffff:8.8.8.8', true],
    ['not-an-ip', false],
  ])('%s → %s', (address, expected) => {
    expect(isPublicAddress(address)).toBe(expected)
  })

  it('safeLookup refuses a name that resolves to a private address', async () => {
    const err = await new Promise((resolve) => safeLookup('localhost', {}, (e) => resolve(e)))
    expect(err).toBeInstanceOf(Error)
  })
})
