import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { shapeFrameText, woffToSfnt } from '@/lib/frame-text'

const pub = (path: string) => fileURLToPath(new URL(`../public${path}`, import.meta.url))

// The browser fetches fonts from /fonts/frame; here they're read from public/.
beforeAll(() => {
  vi.stubGlobal('fetch', async (url: string) => {
    const body = readFileSync(pub(url))
    return new Response(body, { status: 200 })
  })
})
afterAll(() => vi.unstubAllGlobals())

const ONLY_MLCZ = /^[MLCZ0-9.\s-]*$/

describe('frame text outlines', () => {
  it('unpacks WOFF into a font file HarfBuzz can read', () => {
    const sfnt = woffToSfnt(readFileSync(pub('/fonts/frame/arimo/arimo-latin-700-normal.woff')))
    // TrueType fonts start with version 1.0 and carry a table directory.
    expect(new DataView(sfnt.buffer).getUint32(0)).toBe(0x00010000)
    expect(new DataView(sfnt.buffer).getUint16(4)).toBeGreaterThan(5)
  })

  it.each([
    ['Scan me', 'Latin'],
    ['扫码添加微信', 'Chinese'],
    ['スキャンしてね', 'Japanese'],
    ['스캔하세요', 'Korean'],
    ['امسح الرمز', 'Arabic'],
    ['स्कैन करें', 'Hindi'],
    ['สแกนเลย', 'Thai'],
    ['Сканируй', 'Russian'],
  ])('draws %s (%s) with nothing missing', async (text) => {
    const { outline, missing } = await shapeFrameText(text)
    expect(missing).toEqual([])
    expect(outline.text).toBe(text)
    expect(outline.d.length).toBeGreaterThan(50)
    expect(outline.d).toMatch(ONLY_MLCZ)
    expect(outline.advance).toBeGreaterThan(1)
  })

  it('joins Arabic letters (fewer glyph shapes than letters drawn separately)', async () => {
    const joined = await shapeFrameText('سلام')
    const apart = await shapeFrameText('س ل ا م')
    expect(joined.outline.advance).toBeLessThan(apart.outline.advance)
  })

  it('reports characters no font has, and leaves them out', async () => {
    const { missing, outline } = await shapeFrameText('Hi 😀')
    expect(missing).toEqual(['😀'])
    expect(outline.d).toMatch(ONLY_MLCZ)
  })
})
