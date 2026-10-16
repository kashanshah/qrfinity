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
  snapchat: 'Snapchat',
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
  alipay: 'Alipay',
  paypal: 'PayPal',
  venmo: 'Venmo',
  cashapp: 'Cash App',
  pix: 'Pix',
  spotify: 'Spotify',
  appstore: 'App Store',
  googleplay: 'Google Play',
  discord: 'Discord',
  reddit: 'Reddit',
  calendly: 'Calendly',
  zoom: 'Zoom',
  linktree: 'Linktree',
  // Code types without a platform.
  link: 'Link',
  wifi: 'Wi-Fi',
  contact: 'Contact',
  email: 'Email',
  sms: 'SMS',
  phone: 'Phone',
  location: 'Location',
  event: 'Event',
  text: 'Text',
  payment: 'Payment',
} as const

export type BrandIcon = keyof typeof BRAND_ICONS

/** Icons for a kind of code rather than a platform (Wi-Fi, email, a plain link…). */
export const TYPE_ICONS = [
  'link',
  'wifi',
  'contact',
  'email',
  'sms',
  'phone',
  'location',
  'event',
  'text',
  'payment',
] as const satisfies readonly BrandIcon[]

export function isTypeIcon(icon: BrandIcon): boolean {
  return (TYPE_ICONS as readonly string[]).includes(icon)
}

// LinkedIn has no icon: it asked Simple Icons, our source, to remove its mark.
const SOCIAL_BRAND: Record<SocialPlatform, BrandIcon | null> = {
  instagram: 'instagram',
  facebook: 'facebook',
  x: 'x',
  tiktok: 'tiktok',
  snapchat: 'snapchat',
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
  ['snapchat', ['snapchat.com']],
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
  ['alipay', ['alipay.com']],
  ['paypal', ['paypal.me', 'paypal.com']],
  ['venmo', ['venmo.com']],
  ['cashapp', ['cash.app', 'cash.me']],
  ['spotify', ['spotify.com', 'spotify.link']],
  ['appstore', ['apps.apple.com', 'itunes.apple.com']],
  ['googleplay', ['play.google.com']],
  ['discord', ['discord.gg', 'discord.com']],
  ['reddit', ['reddit.com', 'redd.it']],
  ['calendly', ['calendly.com']],
  ['zoom', ['zoom.us', 'zoom.com']],
  ['linktree', ['linktr.ee']],
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
      // A known platform's own icon, else a link.
      return brandForUrl((fields as ContentFields['url']).url) ?? 'link'
    case 'text':
      // WeChat Pay codes hold a wxp:// address rather than a web link.
      return /^\s*wxp:\/\//i.test((fields as ContentFields['text']).text) ? 'wechat' : 'text'
    case 'wifi':
      return 'wifi'
    case 'vcard':
      return 'contact'
    case 'email':
      return 'email'
    case 'sms':
      return 'sms'
    case 'phone':
      return 'phone'
    case 'location':
      return 'location'
    case 'event':
      return 'event'
    case 'payment': {
      // UPI has no single brand (people pay from many apps): it gets the payment icon.
      const method = (fields as ContentFields['payment']).method
      return method === 'upi' ? 'payment' : method
    }
    default:
      return null
  }
}
