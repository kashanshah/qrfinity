import { describe, expect, it } from 'vitest'
import {
  SCAN_BLOBS,
  aeCodeTotalsQuery,
  aeQueries,
  buildScanEvent,
  parseUserAgent,
  refererHost,
  reportFromAe,
  toDataPoint,
  weekly,
} from '../src'

const UA = {
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  android:
    'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  samsung:
    'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  tabletAndroid:
    'Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  windowsEdge:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0',
  macFirefox: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.0; rv:131.0) Gecko/20100101 Firefox/131.0',
  instagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0.0',
  whatsappPreview: 'WhatsApp/2.24.1 A',
  googlebot: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
}

describe('parseUserAgent', () => {
  it.each([
    ['iphone', 'mobile', 'iOS', 'Safari'],
    ['android', 'mobile', 'Android', 'Chrome'],
    ['samsung', 'mobile', 'Android', 'Samsung Internet'],
    ['ipad', 'tablet', 'iOS', 'Safari'],
    ['tabletAndroid', 'tablet', 'Android', 'Chrome'],
    ['windowsEdge', 'desktop', 'Windows', 'Edge'],
    ['macFirefox', 'desktop', 'macOS', 'Firefox'],
    ['instagram', 'mobile', 'iOS', 'Instagram'],
    ['whatsappPreview', 'bot', 'Other', 'Bot'],
    ['googlebot', 'bot', 'Other', 'Bot'],
  ] as const)('%s', (key, device, os, browser) => {
    expect(parseUserAgent(UA[key])).toEqual({ device, os, browser })
  })
  it('handles missing user agents', () => {
    expect(parseUserAgent(null)).toEqual({ device: 'other', os: 'Other', browser: 'Other' })
  })
})

describe('scan events', () => {
  it('maps a request to a data point without the raw IP', async () => {
    const e = await buildScanEvent({
      codeId: 'code-1',
      owner: 'user-1',
      userAgent: UA.iphone,
      referer: 'https://www.instagram.com/p/x',
      ip: '203.0.113.9',
      country: 'ca',
      region: 'Ontario',
      city: 'Toronto',
      salt: 'salt-a',
    })
    expect(e).toMatchObject({
      country: 'CA',
      device: 'mobile',
      os: 'iOS',
      referrer: 'www.instagram.com',
    })
    expect(e.visitor).toMatch(/^[0-9a-f]{16}$/)
    const dp = toDataPoint(e)
    expect(dp.indexes).toEqual(['code-1'])
    expect(dp.blobs).toHaveLength(SCAN_BLOBS.length)
    expect(dp.blobs[8]).toBe('user-1')
    expect(JSON.stringify(dp)).not.toContain('203.0.113.9')
  })
  it('rotating the salt changes the visitor hash', async () => {
    const base = { codeId: 'c', owner: 'u', userAgent: 'x', referer: null, ip: '1.2.3.4' }
    const a = await buildScanEvent({ ...base, salt: 'day1' })
    const b = await buildScanEvent({ ...base, salt: 'day2' })
    expect(a.visitor).not.toBe(b.visitor)
  })
  it('extracts referer hosts safely', () => {
    expect(refererHost('not a url')).toBe('')
    expect(refererHost(null)).toBe('')
  })
})

describe('Analytics Engine SQL', () => {
  it('scopes by code or owner, excludes bots, caps the window', () => {
    const q = aeQueries({ kind: 'code', codeId: 'abc-123' }, 500)
    expect(q.daily).toContain("index1 = 'abc-123'")
    expect(q.daily).toContain("INTERVAL '90' DAY")
    expect(q.daily).toContain("blob4 != 'bot'")
    expect(q.countries).toContain('SELECT blob1 AS key')
    expect(aeQueries({ kind: 'owner', ownerId: 'u_1' }).hourly).toContain("blob9 = 'u_1'")
    expect(aeCodeTotalsQuery('u_1')).toContain('GROUP BY code')
  })
  it('refuses unsafe ids', () => {
    expect(() => aeQueries({ kind: 'code', codeId: "x' OR 1=1 --" })).toThrow()
  })
  it('parses responses into a zero-filled report', () => {
    const now = new Date('2026-10-15T12:00:00Z')
    const empty = { data: [] }
    const r = reportFromAe(
      7,
      {
        daily: {
          data: [
            { t: '2026-10-14 00:00:00', scans: '5', uniques: '3' },
            { t: '2026-10-15 00:00:00', scans: 2, uniques: 2 },
          ],
        },
        hourly: {
          data: [
            { t: '2026-10-14 09:00:00', scans: '4' },
            { t: '2026-10-15 09:00:00', scans: '1' },
            { t: '2026-10-15 18:00:00', scans: '2' },
          ],
        },
        countries: {
          data: [
            { key: 'CA', scans: '6' },
            { key: 'US', scans: '1' },
          ],
        },
        cities: empty,
        devices: empty,
        os: empty,
        browsers: empty,
        referrers: empty,
      },
      now,
    )
    expect(r.daily).toHaveLength(7)
    expect(r.daily[0]).toEqual({ date: '2026-10-09', scans: 0, uniques: 0 })
    expect(r.daily.at(-1)).toEqual({ date: '2026-10-15', scans: 2, uniques: 2 })
    expect(r.totals).toEqual({ scans: 7, uniques: 5 })
    expect(r.hourOfDay[9]).toBe(5)
    expect(r.hourOfDay[18]).toBe(2)
    expect(r.countries).toEqual([
      { key: 'CA', scans: 6 },
      { key: 'US', scans: 1 },
    ])
  })
  it('groups days into Monday-start weeks', () => {
    const w = weekly([
      { date: '2026-10-11', scans: 1, uniques: 1 }, // Sunday
      { date: '2026-10-12', scans: 2, uniques: 1 }, // Monday
      { date: '2026-10-13', scans: 3, uniques: 2 },
    ])
    expect(w).toEqual([
      { week: '2026-10-05', scans: 1, uniques: 1 },
      { week: '2026-10-12', scans: 5, uniques: 3 },
    ])
  })
})
