/**
 * Which platform a code points to, so the generator can put that platform's icon in the middle by
 * default (the logo's "Automatic" choice). Works from the form, not only the finished content, so
 * the icon is ready as soon as someone picks WhatsApp or a social platform.
 */
import { normalizeWebUrl, type ContentFields, type ContentType, type SocialPlatform } from './index'

/** Icon id → the name shown in the generator. Files live in apps/web/public/brand-icons. */
export const BRAND_ICONS = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  facebook: 'Facebook',
  x: 'X',
  tiktok: 'TikTok',
  douyin: 'Douyin',
  youtube: 'YouTube',
  threads: 'Threads',
  pinterest: 'Pinterest',
  telegram: 'Telegram',
  line: 'LINE',
  kakaotalk: 'KakaoTalk',
  weibo: 'Weibo',
  bilibili: 'bilibili',
  xiaohongshu: 'Xiaohongshu',
  wechat: 'WeChat',
  spotify: 'Spotify',
  appstore: 'App Store',
  googleplay: 'Google Play',
  discord: 'Discord',
  reddit: 'Reddit',
} as const

export type BrandIcon = keyof typeof BRAND_ICONS

// LinkedIn has no icon: it asked Simple Icons, our source, to remove its mark.
const SOCIAL_BRAND: Record<SocialPlatform, BrandIcon | null> = {
  instagram: 'instagram',
  facebook: 'facebook',
  x: 'x',
  tiktok: 'tiktok',
  linkedin: null,
  youtube: 'youtube',
  threads: 'threads',
  pinterest: 'pinterest',
  telegram: 'telegram',
  line: 'line',
  kakaotalk: 'kakaotalk',
  weibo: 'weibo',
  bilibili: 'bilibili',
  douyin: 'douyin',
  xiaohongshu: 'xiaohongshu',
}

/** Link hosts (and their subdomains) per platform. */
const HOSTS: [BrandIcon, string[]][] = [
  ['whatsapp', ['wa.me', 'whatsapp.com']],
  ['instagram', ['instagram.com', 'instagr.am']],
  ['facebook', ['facebook.com', 'fb.com', 'fb.me']],
  ['x', ['x.com', 'twitter.com']],
  ['tiktok', ['tiktok.com']],
  ['douyin', ['douyin.com', 'iesdouyin.com']],
  ['youtube', ['youtube.com', 'youtu.be']],
  ['threads', ['threads.com', 'threads.net']],
  ['pinterest', ['pinterest.com', 'pin.it']],
  ['telegram', ['t.me', 'telegram.me', 'telegram.org']],
  ['line', ['line.me', 'lin.ee']],
  ['kakaotalk', ['open.kakao.com', 'pf.kakao.com', 'qr.kakao.com']],
  ['weibo', ['weibo.com', 'weibo.cn']],
  ['bilibili', ['bilibili.com', 'b23.tv']],
  ['xiaohongshu', ['xiaohongshu.com', 'xhslink.com']],
  ['wechat', ['weixin.qq.com', 'wechat.com']],
  ['spotify', ['spotify.com', 'spotify.link']],
  ['appstore', ['apps.apple.com', 'itunes.apple.com']],
  ['googleplay', ['play.google.com']],
  ['discord', ['discord.gg', 'discord.com']],
  ['reddit', ['reddit.com', 'redd.it']],
]

/** The platform a web address belongs to, if it's one we have an icon for. */
export function brandForUrl(url: string): BrandIcon | null {
  const normalized = normalizeWebUrl(url)
  if (!normalized) return null
  const host = new URL(normalized).hostname.toLowerCase()
  for (const [brand, domains] of HOSTS) {
    if (domains.some((d) => host === d || host.endsWith(`.${d}`))) return brand
  }
  return null
}

export function brandFor<K extends ContentType>(
  type: K,
  fields: ContentFields[K],
): BrandIcon | null {
  switch (type) {
    case 'whatsapp':
      return 'whatsapp'
    case 'social':
      return SOCIAL_BRAND[(fields as ContentFields['social']).platform]
    case 'app':
      return (fields as ContentFields['app']).store === 'ios' ? 'appstore' : 'googleplay'
    case 'url':
      return brandForUrl((fields as ContentFields['url']).url)
    default:
      return null
  }
}
