import { describe, expect, it } from 'vitest'
import { DEFAULT_FIELDS, encodeContent, escapeWifi, normalizeWebUrl } from '../src'

const fields = <K extends keyof typeof DEFAULT_FIELDS>(
  type: K,
  patch: Partial<(typeof DEFAULT_FIELDS)[K]>,
) => ({ ...DEFAULT_FIELDS[type], ...patch })

describe('url', () => {
  it('adds https:// and keeps what was typed', () => {
    expect(normalizeWebUrl('example.com/menu')).toBe('https://example.com/menu')
    expect(normalizeWebUrl(' http://example.com ')).toBe('http://example.com')
  })
  it('rejects unsafe or malformed addresses', () => {
    for (const bad of [
      'javascript:alert(1)',
      'data:text/html,hi',
      'ftp://x.com',
      'localhost',
      'exa mple.com',
      'https://.com',
    ]) {
      expect(normalizeWebUrl(bad)).toBeNull()
    }
  })
  it('reports empty separately from invalid', () => {
    expect(encodeContent('url', { url: '' })).toMatchObject({ ok: false, reason: 'empty' })
    expect(encodeContent('url', { url: 'not a url' })).toMatchObject({
      ok: false,
      reason: 'invalid',
    })
  })
})

describe('wifi', () => {
  it('escapes special characters', () => {
    expect(escapeWifi('a;b,c:d"e\\f')).toBe('a\\;b\\,c\\:d\\"e\\\\f')
    expect(
      encodeContent('wifi', fields('wifi', { ssid: 'Café;Guest', password: 'pass:word1' })),
    ).toEqual({
      ok: true,
      payload: 'WIFI:T:WPA;S:Café\\;Guest;P:pass\\:word1;;',
    })
  })
  it('omits the password for open networks and marks hidden ones', () => {
    expect(
      encodeContent('wifi', fields('wifi', { ssid: 'Open', encryption: 'nopass', hidden: true })),
    ).toEqual({
      ok: true,
      payload: 'WIFI:T:nopass;S:Open;H:true;;',
    })
  })
  it('requires a valid WPA password', () => {
    expect(
      encodeContent('wifi', fields('wifi', { ssid: 'Home', password: 'short' })),
    ).toMatchObject({ ok: false, reason: 'invalid' })
  })
})

describe('vcard', () => {
  it('builds a vCard 3.0 with escaping', () => {
    const r = encodeContent(
      'vcard',
      fields('vcard', {
        firstName: 'Ada',
        lastName: 'Lovelace',
        organization: 'Engines, Inc.',
        mobile: '+1 (555) 010-2000',
        email: 'ada@example.com',
        website: 'example.com',
        city: 'London',
        note: 'Line 1\nLine 2',
      }),
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.payload.split('\n')).toEqual([
      'BEGIN:VCARD',
      'VERSION:3.0',
      'N:Lovelace;Ada;;;',
      'FN:Ada Lovelace',
      'ORG:Engines\\, Inc.',
      'TEL;TYPE=CELL:+15550102000',
      'EMAIL:ada@example.com',
      'URL:https://example.com',
      'ADR;TYPE=WORK:;;;London;;;',
      'NOTE:Line 1\\nLine 2',
      'END:VCARD',
    ])
  })
  it('flags a bad email', () => {
    expect(
      encodeContent('vcard', fields('vcard', { firstName: 'A', email: 'nope' })),
    ).toMatchObject({ errors: { email: expect.any(String) } })
  })
})

describe('messaging and phone', () => {
  it('email uses mailto with encoded params', () => {
    expect(
      encodeContent('email', { to: 'hi@example.com', subject: 'Hello there', body: 'A&B' }),
    ).toEqual({
      ok: true,
      payload: 'mailto:hi@example.com?subject=Hello%20there&body=A%26B',
    })
  })
  it('sms uses SMSTO', () => {
    expect(encodeContent('sms', { phone: '+1 555-010-2000', message: 'Hi' })).toEqual({
      ok: true,
      payload: 'SMSTO:+15550102000:Hi',
    })
  })
  it('phone uses tel:', () => {
    expect(encodeContent('phone', { phone: '(555) 010 2000' })).toEqual({
      ok: true,
      payload: 'tel:5550102000',
    })
  })
  it('whatsapp uses wa.me with digits only', () => {
    expect(encodeContent('whatsapp', { phone: '+44 7700 900123', message: 'Table 4?' })).toEqual({
      ok: true,
      payload: 'https://wa.me/447700900123?text=Table%204%3F',
    })
    expect(encodeContent('whatsapp', { phone: '0044 7700 900123', message: '' })).toEqual({
      ok: true,
      payload: 'https://wa.me/447700900123',
    })
    expect(encodeContent('whatsapp', { phone: '123', message: '' })).toMatchObject({
      reason: 'invalid',
    })
  })
})

describe('location', () => {
  it('links to a map search by address or coordinates', () => {
    expect(
      encodeContent('location', fields('location', { address: '1 Main St, Toronto' })),
    ).toEqual({
      ok: true,
      payload: 'https://www.google.com/maps/search/?api=1&query=1%20Main%20St%2C%20Toronto',
    })
    expect(
      encodeContent(
        'location',
        fields('location', { mode: 'coordinates', latitude: '43.65', longitude: '-79.38' }),
      ),
    ).toEqual({
      ok: true,
      payload: 'https://www.google.com/maps/search/?api=1&query=43.65,-79.38',
    })
  })
  it('validates coordinate ranges', () => {
    expect(
      encodeContent(
        'location',
        fields('location', { mode: 'coordinates', latitude: '91', longitude: '0' }),
      ),
    ).toMatchObject({
      errors: { latitude: expect.any(String) },
    })
  })
})

describe('event', () => {
  it('writes a timed VEVENT in floating local time', () => {
    expect(
      encodeContent(
        'event',
        fields('event', {
          title: 'Launch; party',
          start: '2026-10-20T18:30',
          end: '2026-10-20T21:00',
          location: 'Toronto',
        }),
      ),
    ).toEqual({
      ok: true,
      payload:
        'BEGIN:VEVENT\nSUMMARY:Launch\\; party\nDTSTART:20261020T183000\nDTEND:20261020T210000\nLOCATION:Toronto\nEND:VEVENT',
    })
  })
  it('writes an all-day event with an exclusive end date', () => {
    const r = encodeContent(
      'event',
      fields('event', { title: 'Fair', allDay: true, start: '2026-12-31', end: '2026-12-31' }),
    )
    expect(r).toMatchObject({ ok: true })
    if (r.ok) expect(r.payload).toContain('DTSTART;VALUE=DATE:20261231\nDTEND;VALUE=DATE:20270101')
  })
  it('rejects an end before the start', () => {
    expect(
      encodeContent(
        'event',
        fields('event', { title: 'X', start: '2026-10-20T18:30', end: '2026-10-20T08:00' }),
      ),
    ).toMatchObject({
      errors: { end: expect.any(String) },
    })
  })
})

describe('app and social', () => {
  it('accepts only the matching store', () => {
    expect(
      encodeContent('app', { store: 'ios', url: 'https://apps.apple.com/app/id123' }),
    ).toMatchObject({ ok: true })
    expect(
      encodeContent('app', {
        store: 'ios',
        url: 'https://play.google.com/store/apps/details?id=x',
      }),
    ).toMatchObject({ reason: 'invalid' })
    expect(
      encodeContent('app', { store: 'android', url: 'play.google.com/store/apps/details?id=x' }),
    ).toEqual({
      ok: true,
      payload: 'https://play.google.com/store/apps/details?id=x',
    })
  })
  it('turns a handle into a profile link, or keeps a pasted link', () => {
    expect(encodeContent('social', { platform: 'tiktok', handle: '@qrfinity' })).toEqual({
      ok: true,
      payload: 'https://www.tiktok.com/@qrfinity',
    })
    expect(encodeContent('social', { platform: 'linkedin', handle: 'ada-l' })).toEqual({
      ok: true,
      payload: 'https://www.linkedin.com/in/ada-l',
    })
    expect(
      encodeContent('social', { platform: 'instagram', handle: 'https://instagram.com/x' }),
    ).toEqual({ ok: true, payload: 'https://instagram.com/x' })
    expect(encodeContent('social', { platform: 'x', handle: 'two words' })).toMatchObject({
      reason: 'invalid',
    })
  })
})
