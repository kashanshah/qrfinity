import { describe, expect, it } from 'vitest'
import { GET } from '@/app/api/consent-region/route'
import { consentRequiredFor } from '@/lib/consent-region'

const h = (init: Record<string, string>) => new Headers(init)

describe('where we ask before analytics cookies', () => {
  it('asks in the EU, EEA, UK and Switzerland', () => {
    for (const c of ['DE', 'FR', 'IE', 'NO', 'IS', 'GB', 'CH', 'de'])
      expect(consentRequiredFor(h({ 'x-vercel-ip-country': c })), c).toBe(true)
  })

  it('doesn’t ask elsewhere, on Vercel or Cloudflare', () => {
    expect(consentRequiredFor(h({ 'x-vercel-ip-country': 'CA' }))).toBe(false)
    expect(consentRequiredFor(h({ 'x-vercel-ip-country': 'US' }))).toBe(false)
    expect(consentRequiredFor(h({ 'cf-ipcountry': 'PK' }))).toBe(false)
  })

  it('asks when the country is unknown', () => {
    expect(consentRequiredFor(h({}))).toBe(true)
    expect(consentRequiredFor(h({ 'cf-ipcountry': 'XX' }))).toBe(true)
    expect(consentRequiredFor(h({ 'cf-ipcountry': 'T1' }))).toBe(true)
  })

  it('answers yes/no only and is never cached between visitors', async () => {
    const res = GET(
      new Request('https://qrfinity.com/api/consent-region', {
        headers: { 'x-vercel-ip-country': 'CA' },
      }),
    )
    expect(await res.json()).toEqual({ required: false })
    expect(res.headers.get('cache-control')).toBe('private, no-store')
  })
})
