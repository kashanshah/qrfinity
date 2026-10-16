import { describe, expect, it } from 'vitest'
import { isHighConfidence, screenDestination } from '../src'

describe('screenDestination', () => {
  it('refuses other shorteners, including subdomains and path-scoped ones', () => {
    expect(screenDestination('https://bit.ly/3abc')?.rule).toBe('shortener')
    expect(screenDestination('https://www.tinyurl.com/x')?.rule).toBe('shortener')
    expect(screenDestination('https://qrco.de/abc')?.rule).toBe('shortener')
    expect(screenDestination('https://linktr.ee/s/abc')?.rule).toBe('shortener')
    expect(screenDestination('https://linktr.ee/mycafe')).toBeNull()
    expect(screenDestination('https://notbit.ly/x')).toBeNull()
  })
  it('applies blocklist domains, TLDs and substrings', () => {
    const list = [
      { kind: 'domain' as const, value: 'evil.example' },
      { kind: 'tld' as const, value: '.zip' },
      { kind: 'contains' as const, value: '/wp-login.php' },
    ]
    expect(screenDestination('https://login.evil.example/a', list)?.rule).toBe('domain')
    expect(screenDestination('https://invoice.zip/', list)?.rule).toBe('tld')
    expect(screenDestination('https://shop.example/wp-login.php?x', list)?.rule).toBe('contains')
    expect(screenDestination('https://example.com/menu', list)).toBeNull()
  })
  it('classifies threat confidence', () => {
    expect(isHighConfidence(['SOCIAL_ENGINEERING'])).toBe(true)
    expect(isHighConfidence(['UNWANTED_SOFTWARE'])).toBe(false)
  })
})
