import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DESIGN,
  DEFAULT_FIELDS,
  brandFor,
  brandForUrl,
  buildScene,
  effectiveEcc,
  encodeContent,
  sanitizeDesign,
  sceneToEps,
  sceneToSvg,
} from '../src'

describe('brandFor', () => {
  it('follows the content type and the platform picked', () => {
    expect(brandFor('whatsapp', DEFAULT_FIELDS.whatsapp)).toBe('whatsapp')
    expect(brandFor('social', { platform: 'telegram', handle: '' })).toBe('telegram')
    expect(brandFor('social', { platform: 'linkedin', handle: 'ada' })).toBeNull()
    expect(brandFor('app', { store: 'ios', url: '' })).toBe('appstore')
    expect(brandFor('app', { store: 'android', url: '' })).toBe('googleplay')
    // Every other kind of code gets an icon for its type.
    expect(brandFor('wifi', DEFAULT_FIELDS.wifi)).toBe('wifi')
    expect(brandFor('vcard', DEFAULT_FIELDS.vcard)).toBe('contact')
    expect(brandFor('email', DEFAULT_FIELDS.email)).toBe('email')
    expect(brandFor('sms', DEFAULT_FIELDS.sms)).toBe('sms')
    expect(brandFor('phone', DEFAULT_FIELDS.phone)).toBe('phone')
    expect(brandFor('location', DEFAULT_FIELDS.location)).toBe('location')
    expect(brandFor('event', DEFAULT_FIELDS.event)).toBe('event')
    expect(brandFor('text', { text: 'hello' })).toBe('text')
    expect(brandFor('text', { text: 'wxp://f2f0abc' })).toBe('wechat')
    expect(brandFor('url', { url: 'example.com/menu' })).toBe('link')
    expect(brandFor('url', { url: 'youtube.com/@me' })).toBe('youtube')
  })
  it('recognises known links, including subdomains, and nothing else', () => {
    expect(brandFor('url', { url: 'youtu.be/abc' })).toBe('youtube')
    expect(brandForUrl('https://m.youtube.com/watch?v=1')).toBe('youtube')
    expect(brandForUrl('https://open.spotify.com/artist/1')).toBe('spotify')
    expect(brandForUrl('https://v.douyin.com/abc/')).toBe('douyin')
    expect(brandForUrl('https://www.xiaohongshu.com/user/profile/1')).toBe('xiaohongshu')
    expect(brandForUrl('https://weixin.qq.com/r/abc')).toBe('wechat')
    expect(brandForUrl('https://notyoutube.com/')).toBeNull()
    expect(brandForUrl('https://example.com/?u=youtube.com')).toBeNull()
    expect(brandForUrl('')).toBeNull()
    expect(brandForUrl('not a link')).toBeNull()
  })
})

describe('new social platforms', () => {
  const social = (platform: Parameters<typeof brandFor<'social'>>[1]['platform'], handle: string) =>
    encodeContent('social', { platform, handle })

  it('makes profile links from usernames and IDs', () => {
    expect(social('telegram', '@qrfinity')).toEqual({ ok: true, payload: 'https://t.me/qrfinity' })
    expect(social('line', '@shop')).toEqual({ ok: true, payload: 'https://line.me/R/ti/p/@shop' })
    expect(social('line', 'ada.l')).toEqual({ ok: true, payload: 'https://line.me/ti/p/~ada.l' })
    expect(social('weibo', '1234567')).toEqual({ ok: true, payload: 'https://weibo.com/u/1234567' })
    expect(social('bilibili', '42')).toEqual({ ok: true, payload: 'https://space.bilibili.com/42' })
  })
  it('asks for a link where a username is not enough', () => {
    expect(social('douyin', 'someone')).toMatchObject({
      reason: 'invalid',
      errors: { handle: 'Paste the share link from Douyin.' },
    })
    expect(social('weibo', 'nickname')).toMatchObject({ reason: 'invalid' })
    expect(social('kakaotalk', 'https://open.kakao.com/o/abc')).toEqual({
      ok: true,
      payload: 'https://open.kakao.com/o/abc',
    })
  })
  it('takes the link out of a copied share message', () => {
    expect(
      social('douyin', '7.92 复制打开抖音，看看【小明的作品】 https://v.douyin.com/iRNBgUjc/ 码字'),
    ).toEqual({ ok: true, payload: 'https://v.douyin.com/iRNBgUjc/' })
    expect(social('xiaohongshu', '来看看 http://xhslink.com/a/AbC，复制本条')).toEqual({
      ok: true,
      payload: 'http://xhslink.com/a/AbC',
    })
  })
})

describe('automatic logo setting', () => {
  it('is kept when saved, and off for designs saved before it existed', () => {
    expect(sanitizeDesign({ logoAuto: true }).logoAuto).toBe(true)
    expect(sanitizeDesign({}).logoAuto).toBe(false)
    expect(sanitizeDesign({ logoAuto: 'yes' }).logoAuto).toBe(false)
  })
})

describe('vector logos', () => {
  const logo = {
    type: 'vector' as const,
    width: 30,
    height: 30,
    paths: [
      { d: 'M0 0L30 0L30 30L0 30Z', fill: '#FFFFFF' },
      { d: 'M5 5C10 5 25 10 25 25Z', fill: '#25D366' },
    ],
  }
  const design = { ...DEFAULT_DESIGN, logo, logoAuto: true }

  it('draws the logo as paths inside the logo box, not as an image', () => {
    const { scene, info } = buildScene('https://wa.me/14165550100', design)
    expect(scene.items.some((i) => i.kind === 'image')).toBe(false)
    const logoPaths = scene.items.filter(
      (i) => i.kind === 'path' && i.fill.type === 'solid' && i.fill.color === '#25D366',
    )
    expect(logoPaths).toHaveLength(1)
    const nums = (logoPaths[0] as { d: string }).d.match(/-?[\d.]+/g)!.map(Number)
    const { x, size } = info.codeBox
    for (const v of nums) {
      expect(v).toBeGreaterThan(x + size * 0.3)
      expect(v).toBeLessThan(x + size * 0.7)
    }
    expect(effectiveEcc(design)).toBe('H')
  })

  it('stays vector in SVG and EPS', () => {
    const { scene } = buildScene('https://wa.me/14165550100', design)
    const svg = sceneToSvg(scene)
    expect(svg).not.toContain('<image')
    expect(svg).toContain('fill="#25D366"')
    const eps = sceneToEps(scene, { widthPt: 144 })
    expect(eps).not.toMatch(/\bimage\b/)
    expect(eps).toContain('c')
  })

  it('keeps a valid vector logo and drops anything else', () => {
    expect(sanitizeDesign(design).logo).toEqual({
      ...logo,
      paths: logo.paths.map((p) => ({ ...p, fill: p.fill.toLowerCase() })),
    })
    const bad = (paths: unknown) => sanitizeDesign({ logo: { ...logo, paths } }).logo
    expect(bad([{ d: 'M0 0"/><script>alert(1)</script>', fill: '#000000' }])).toBeNull()
    expect(bad([{ d: 'M0 0a1 1 0 0 0 2 2', fill: '#000000' }])).toBeNull()
    expect(bad([{ d: 'M0 0L1 1Z', fill: 'red;x' }])).toBeNull()
    expect(bad([])).toBeNull()
    expect(bad(Array(17).fill({ d: 'M0 0Z', fill: '#000000' }))).toBeNull()
  })
})

describe('frame text outlines', () => {
  const design = {
    ...DEFAULT_DESIGN,
    frame: { ...DEFAULT_DESIGN.frame, style: 'box-bottom' as const, text: ' 扫码 ' },
  }
  const outline = { text: '扫码', d: 'M0 0L1 0L1 -0.7L0 -0.7ZM1 0L2 0L2 -0.7Z', advance: 2 }

  it('draws the frame text as paths when an outline matches', () => {
    const { scene } = buildScene('https://example.com', design, { frameText: outline })
    expect(scene.items.some((i) => i.kind === 'text')).toBe(false)
    const svg = sceneToSvg(scene)
    expect(svg).not.toContain('<text')
    const eps = sceneToEps(scene, { widthPt: 144 })
    expect(eps).not.toMatch(/\bshow\b/)
  })

  it('fits the outline inside the band', () => {
    const wide = { ...outline, advance: 40 }
    const { scene } = buildScene('https://example.com', design, { frameText: wide })
    const label = scene.items.at(-1) as { d: string }
    const xs = label.d
      .match(/-?[\d.]+/g)!
      .map(Number)
      .filter((_, i) => i % 2 === 0)
    expect(Math.min(...xs)).toBeGreaterThan(0)
    expect(Math.max(...xs)).toBeLessThan(scene.width)
  })

  it('falls back to text when the outline is for other text', () => {
    const { scene } = buildScene('https://example.com', design, {
      frameText: { ...outline, text: 'old' },
    })
    expect(scene.items.some((i) => i.kind === 'text')).toBe(true)
  })
})
