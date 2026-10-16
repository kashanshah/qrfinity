import { afterEach, describe, expect, it, vi } from 'vitest'

const load = async () => {
  vi.resetModules()
  return import('@/lib/server/indexnow')
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('IndexNow', () => {
  it('picks every page, or only recently updated ones', async () => {
    const { pagesToSubmit } = await load()
    const all = pagesToSubmit(true)
    expect(all).toContain('https://qrfinity.com/qr-code-generator/wifi')
    expect(pagesToSubmit(false, new Date('2030-01-01'))).toEqual([])
  })

  it('does nothing until the site is indexable and a key is set', async () => {
    vi.stubEnv('NEXT_PUBLIC_INDEXABLE', 'false')
    vi.stubEnv('INDEXNOW_KEY', 'abc123def4567890')
    expect((await (await load()).submitToIndexNow(['https://qrfinity.com/'])).skipped).toMatch(
      'not indexable',
    )
    vi.stubEnv('NEXT_PUBLIC_INDEXABLE', 'true')
    vi.stubEnv('INDEXNOW_KEY', '')
    expect((await (await load()).submitToIndexNow(['https://qrfinity.com/'])).skipped).toMatch(
      'INDEXNOW_KEY',
    )
  })

  it('posts the key, its location and the URLs', async () => {
    vi.stubEnv('NEXT_PUBLIC_INDEXABLE', 'true')
    vi.stubEnv('INDEXNOW_KEY', 'abc123def4567890')
    const fetchMock = vi.fn(async () => new Response(null, { status: 202 }))
    vi.stubGlobal('fetch', fetchMock)
    const r = await (
      await load()
    ).submitToIndexNow(['https://qrfinity.com/', 'https://qrfinity.com/pricing'])
    expect(r).toEqual({ submitted: 2, status: 202 })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.indexnow.org/indexnow')
    expect(JSON.parse(String(init.body))).toEqual({
      host: 'qrfinity.com',
      key: 'abc123def4567890',
      keyLocation: 'https://qrfinity.com/indexnow-key.txt',
      urlList: ['https://qrfinity.com/', 'https://qrfinity.com/pricing'],
    })
  })
})
