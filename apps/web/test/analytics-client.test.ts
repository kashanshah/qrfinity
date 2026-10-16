import { afterEach, describe, expect, it, vi } from 'vitest'

const load = async () => {
  vi.resetModules()
  return import('@/lib/analytics')
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('site analytics', () => {
  it('is off, and track() does nothing, without keys', async () => {
    vi.stubEnv('NEXT_PUBLIC_GA_ID', '')
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', '')
    const gtag = vi.fn()
    vi.stubGlobal('window', { gtag })
    const a = await load()
    expect(a.ANALYTICS_ENABLED).toBe(false)
    a.track('pro_waitlist_joined', {})
    expect(gtag).not.toHaveBeenCalled()
  })

  it('sends events to both tools when on, and never throws', async () => {
    vi.stubEnv('NEXT_PUBLIC_GA_ID', 'G-TEST')
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test')
    const gtag = vi.fn()
    const capture = vi.fn()
    vi.stubGlobal('window', { gtag, __qrfinityPosthog: { capture } })
    const a = await load()
    a.track('qr_downloaded', { format: 'SVG', content_type: 'wifi', kind: 'static' })
    expect(gtag).toHaveBeenCalledWith('event', 'qr_downloaded', {
      format: 'SVG',
      content_type: 'wifi',
      kind: 'static',
    })
    expect(capture).toHaveBeenCalledWith('qr_downloaded', {
      format: 'SVG',
      content_type: 'wifi',
      kind: 'static',
    })
    vi.stubGlobal('window', {
      gtag: () => {
        throw new Error('blocked')
      },
    })
    expect(() => a.track('pro_waitlist_joined', {})).not.toThrow()
  })

  it('remembers the cookie choice and never loads on admin pages', async () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    })
    const dispatchEvent = vi.fn()
    vi.stubGlobal('window', { dispatchEvent })
    vi.stubGlobal(
      'CustomEvent',
      class {
        constructor(
          public type: string,
          public init: unknown,
        ) {}
      },
    )
    const a = await load()
    expect(a.readConsent()).toBeNull()
    a.saveConsent('granted')
    expect(a.readConsent()).toBe('granted')
    expect(dispatchEvent).toHaveBeenCalledTimes(1)
    expect(a.analyticsAllowedOn('/admin/flags')).toBe(false)
    expect(a.analyticsAllowedOn('/qr-code-generator/wifi')).toBe(true)
  })
})
