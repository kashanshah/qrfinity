import { DEFAULT_DESIGN } from '@qrfinity/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { classifyTraffic } from '@/lib/traffic-source'

const load = async () => {
  vi.resetModules()
  return import('@/lib/analytics')
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('event properties', () => {
  it('drop anything that could be content: links, emails, paths, long numbers', async () => {
    const a = await load()
    expect(
      a.cleanProps({
        format: 'PNG',
        content_type: 'wifi',
        count: 3,
        on: false,
        link: 'https://example.com/menu',
        bare: 'example.com',
        email: 'me@example.com',
        path: 'menus/lunch',
        phone: '4165550199',
        missing: null,
        nested: { a: 1 },
      }),
    ).toEqual({ format: 'PNG', content_type: 'wifi', count: 3, on: false, missing: 'none' })
  })

  it('keep Stripe ids as transaction ids and host names as sources only', async () => {
    const a = await load()
    expect(
      a.cleanProps({
        transaction_id: 'cs_test_a1B2c3D4e5F6g7H8',
        source_name: 'chatgpt.com',
        source_campaign: 'spring-menu',
        source_medium: 'https://evil.example/x',
      }),
    ).toEqual({
      transaction_id: 'cs_test_a1B2c3D4e5F6g7H8',
      source_name: 'chatgpt.com',
      source_campaign: 'spring-menu',
    })
  })

  it('cleans what track() sends and sends trackOnce() events once', async () => {
    vi.stubEnv('NEXT_PUBLIC_GA_ID', 'G-TEST')
    const gtag = vi.fn()
    vi.stubGlobal('window', { gtag })
    const a = await load()
    a.track('content_variant_selected', { content_type: 'url', variant: 'https://x.y/z' })
    expect(gtag).toHaveBeenLastCalledWith('event', 'content_variant_selected', {
      content_type: 'url',
    })
    a.trackOnce('k', 'design_saved', { saved_count: 1 })
    a.trackOnce('k', 'design_saved', { saved_count: 2 })
    expect(gtag).toHaveBeenCalledTimes(2)
  })

  it('describe a design by option names only', async () => {
    const a = await load()
    expect(a.designProps(DEFAULT_DESIGN)).toEqual({
      dot_style: 'square',
      eye_style: 'square-square',
      colors: 'default',
      gradient: 'none',
      logo: 'none',
      frame: 'none',
      transparent: false,
    })
    expect(
      a.designProps({
        ...DEFAULT_DESIGN,
        foreground: { type: 'linear', from: '#123456', to: '#654321', angle: 0 },
        logo: { src: 'data:image/png;base64,AAAA', width: 1, height: 1 },
        logoAuto: false,
        frame: { ...DEFAULT_DESIGN.frame, style: 'box-bottom' },
      }),
    ).toMatchObject({ colors: 'custom', gradient: 'linear', logo: 'custom', frame: 'box-bottom' })
    expect(a.contentVariant('social', { platform: 'instagram', handle: 'joes' })).toBe('instagram')
    expect(a.contentVariant('url', { url: 'https://x.y' })).toBe('none')
  })

  it('name an error without its message when the message might hold content', async () => {
    const a = await load()
    expect(a.errorText(new TypeError('x is undefined'))).toBe('TypeError: x is undefined')
    expect(a.errorText(new Error('Failed to load https://example.com/a'))).toBe('Error')
  })
})

describe('traffic sources', () => {
  const land = 'https://qrfinity.com/qr-code-generator/wifi'

  it('give AI assistants their own channel, by referrer or by utm_source', () => {
    expect(classifyTraffic(land, 'https://chatgpt.com/')).toMatchObject({
      channel: 'ai_assistant',
      source: 'chatgpt',
    })
    expect(classifyTraffic(`${land}?utm_source=chatgpt.com`, '')).toMatchObject({
      channel: 'ai_assistant',
      source: 'chatgpt.com',
    })
    expect(classifyTraffic(land, 'https://www.perplexity.ai/search?q=qr')).toMatchObject({
      channel: 'ai_assistant',
      source: 'perplexity',
    })
    expect(classifyTraffic(land, 'https://gemini.google.com/app')?.source).toBe('gemini')
    expect(classifyTraffic(land, 'https://claude.ai/chat/1')?.source).toBe('claude')
  })

  it('sort search, social, email, paid, scans, referrals and direct', () => {
    expect(classifyTraffic(land, 'https://www.google.ca/')).toMatchObject({
      channel: 'search',
      source: 'google',
    })
    expect(classifyTraffic(land, 'https://t.co/abc')?.channel).toBe('social')
    expect(classifyTraffic(land, 'https://mail.google.com/')?.channel).toBe('email')
    expect(classifyTraffic(`${land}?gclid=abc`, 'https://www.google.com/')?.channel).toBe('paid')
    expect(
      classifyTraffic(`${land}?utm_source=newsletter&utm_medium=email&utm_campaign=Oct`, ''),
    ).toEqual({ channel: 'email', source: 'newsletter', medium: 'email', campaign: 'oct' })
    expect(classifyTraffic(land, 'https://qrfinity.link/joes-menu')?.channel).toBe('qr_scan')
    expect(classifyTraffic(land, 'https://blog.example.org/post?id=1')).toEqual({
      channel: 'referral',
      source: 'blog.example.org',
      medium: 'referral',
      campaign: 'none',
    })
    expect(classifyTraffic(land, '')?.channel).toBe('direct')
  })

  it('treat our own pages, sign-in and checkout hops as the same visit', () => {
    expect(classifyTraffic(land, 'https://qrfinity.com/')).toBeNull()
    expect(classifyTraffic(land, 'https://checkout.stripe.com/c/pay')).toBeNull()
    expect(classifyTraffic(land, 'https://accounts.google.com/')).toBeNull()
  })
})
