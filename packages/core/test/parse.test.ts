import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FIELDS,
  encodeContent,
  identifyQrService,
  isQrfinityLink,
  parseContent,
  type ContentFields,
  type ContentType,
} from '../src'

const roundTrip = <K extends ContentType>(type: K, patch: Partial<ContentFields[K]>) => {
  const fields = { ...DEFAULT_FIELDS[type], ...patch }
  const encoded = encodeContent(type, fields)
  if (!encoded.ok) throw new Error(`could not encode ${type}`)
  return { fields, parsed: parseContent(encoded.payload) }
}

describe('parseContent reads back everything the generator makes', () => {
  it.each([
    ['url', { url: 'https://example.com/menu?table=4' }],
    ['text', { text: 'Gate code 4417\nSecond line' }],
    ['wifi', { ssid: 'Café; "Guest"', password: 'p:a\\ss,word', encryption: 'WPA', hidden: true }],
    ['wifi', { ssid: 'Open lobby', password: '', encryption: 'nopass', hidden: false }],
    [
      'vcard',
      {
        firstName: 'Amira',
        lastName: 'Haddad',
        organization: 'Haddad, Sons; Co',
        title: 'Owner',
        mobile: '+15551234567',
        workPhone: '+15557654321',
        email: 'amira@example.com',
        website: 'https://example.com',
        street: '1 Main St',
        city: 'Toronto',
        region: 'ON',
        postalCode: 'M5V 1A1',
        country: 'Canada',
        note: 'Line one\nLine two',
      },
    ],
    ['email', { to: 'hi@example.com', subject: 'Table 4 & more', body: 'Hello\nthere' }],
    ['sms', { phone: '+15551234567', message: 'Hi: from the poster' }],
    ['phone', { phone: '+15551234567' }],
    ['whatsapp', { phone: '+15551234567', message: 'Book a table' }],
    ['location', { mode: 'address', address: 'CN Tower, Toronto', placeId: 'ChIJ123' }],
    ['location', { mode: 'coordinates', latitude: '43.6426', longitude: '-79.3871' }],
    [
      'event',
      {
        title: 'Launch; party',
        allDay: false,
        start: '2026-11-20T18:30',
        end: '2026-11-20T21:00',
        location: 'Hall A',
        description: 'Bring, a friend',
      },
    ],
    [
      'event',
      {
        title: 'Fair',
        allDay: true,
        start: '2026-12-01',
        end: '2026-12-03',
        location: '',
        description: '',
      },
    ],
    ['app', { store: 'ios', url: 'https://apps.apple.com/app/id123' }],
    ['app', { store: 'android', url: 'https://play.google.com/store/apps/details?id=x' }],
  ] as const)('%s', (type, patch) => {
    const { fields, parsed } = roundTrip(type, patch as never)
    expect(parsed.type).toBe(type)
    // Encoders normalise some values (phone numbers, links); compare what survives encoding.
    expect(encodeContent(parsed.type, parsed.fields as never)).toEqual(encodeContent(type, fields))
    if (type !== 'vcard' && type !== 'event') expect(parsed.fields).toMatchObject(fields)
  })

  it('keeps every vCard field, including escaped commas, semicolons and line breaks', () => {
    const { fields, parsed } = roundTrip('vcard', {
      firstName: 'Amira',
      lastName: 'Haddad',
      organization: 'Haddad, Sons; Co',
      note: 'Line one\nLine two',
      mobile: '+15551234567',
    })
    expect(parsed.fields).toMatchObject(fields)
  })
})

describe('parseContent reads other generators’ formats', () => {
  it('MATMSG email, sms: links and geo: points', () => {
    expect(parseContent(String.raw`MATMSG:TO:a@b.co;SUB:Hi;BODY:Text\;more;;`)).toEqual({
      type: 'email',
      fields: { to: 'a@b.co', subject: 'Hi', body: 'Text;more' },
    })
    expect(parseContent('sms:+15551234567?body=Hello%20there')).toMatchObject({
      type: 'sms',
      fields: { phone: '+15551234567', message: 'Hello there' },
    })
    expect(parseContent('geo:43.64,-79.38')).toMatchObject({
      type: 'location',
      fields: { mode: 'coordinates', latitude: '43.64', longitude: '-79.38' },
    })
  })

  it('folded vCard lines and an FN-only name', () => {
    const card = 'BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Jo Bloggs\r\nNOTE:A long no\r\n te\r\nEND:VCARD'
    expect(parseContent(card)).toMatchObject({
      type: 'vcard',
      fields: { firstName: 'Jo', lastName: 'Bloggs', note: 'A long note' },
    })
  })

  it('events wrapped in VCALENDAR', () => {
    const cal =
      'BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:Gala\nDTSTART:20261120T183000\nEND:VEVENT\nEND:VCALENDAR'
    expect(parseContent(cal)).toMatchObject({
      type: 'event',
      fields: { title: 'Gala', start: '2026-11-20T18:30', allDay: false },
    })
  })

  it('treats anything else as text, and unsafe links as text too', () => {
    expect(parseContent('hello')).toMatchObject({ type: 'text', fields: { text: 'hello' } })
    expect(parseContent('javascript:alert(1)')).toMatchObject({ type: 'text' })
  })
})

describe('identifyQrService', () => {
  it('names known services by their short-link domains and subdomains', () => {
    expect(identifyQrService('https://qrco.de/bfXyz')?.name).toBe('QR Code Generator PRO')
    expect(identifyQrService('https://l.ead.me/abc')?.name).toBe('QR Code Generator PRO')
    expect(identifyQrService('https://qr1.be/ABCD')?.name).toBe('QR TIGER')
    expect(identifyQrService('https://app.me-qr.com/x')?.name).toBe('ME-QR')
  })
  it('stays quiet for everything else', () => {
    expect(identifyQrService('https://example.com/qrco.de')).toBeNull()
    expect(identifyQrService('https://notqrco.de/x')).toBeNull()
    expect(identifyQrService('not a url')).toBeNull()
  })
  it('recognises our own short links', () => {
    expect(isQrfinityLink('https://qrfinity.link/abc1234')).toBe(true)
    expect(isQrfinityLink('https://example.com')).toBe(false)
  })
})
