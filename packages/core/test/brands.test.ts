import { describe, expect, it } from 'vitest'
import { DEFAULT_FIELDS, brandFor, brandForUrl, encodeContent, sanitizeDesign } from '../src'

describe('brandFor', () => {
  it('follows the content type and the platform picked', () => {
    expect(brandFor('whatsapp', DEFAULT_FIELDS.whatsapp)).toBe('whatsapp')
    expect(brandFor('social', { platform: 'telegram', handle: '' })).toBe('telegram')
    expect(brandFor('social', { platform: 'linkedin', handle: 'ada' })).toBeNull()
    expect(brandFor('app', { store: 'ios', url: '' })).toBe('appstore')
    expect(brandFor('app', { store: 'android', url: '' })).toBe('googleplay')
    expect(brandFor('wifi', DEFAULT_FIELDS.wifi)).toBeNull()
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
