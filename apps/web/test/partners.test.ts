import { afterEach, describe, expect, it, vi } from 'vitest'

const load = async () => {
  vi.resetModules()
  return import('@/lib/partners')
}

afterEach(() => vi.unstubAllEnvs())

describe('partner links', () => {
  it('are hidden when not configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_PRINT_PARTNER_URL', '')
    vi.stubEnv('NEXT_PUBLIC_AGENCY_URL', '')
    const p = await load()
    expect(p.PRINT_PARTNER_URL).toBeNull()
    expect(p.AGENCY_URL).toBeNull()
  })

  it('add UTM tags and keep existing parameters', async () => {
    vi.stubEnv('NEXT_PUBLIC_PRINT_PARTNER_URL', 'https://craftigure.com/stickers?ref=1')
    vi.stubEnv('NEXT_PUBLIC_AGENCY_URL', 'javascript:alert(1)')
    const p = await load()
    expect(p.PRINT_PARTNER_URL).toBe(
      'https://craftigure.com/stickers?ref=1&utm_source=qrfinity&utm_medium=referral&utm_campaign=download',
    )
    expect(p.AGENCY_URL).toBeNull()
  })
})
