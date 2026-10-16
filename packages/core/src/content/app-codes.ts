/**
 * Codes that only an app can make (WeChat, WeChat Pay, Alipay), so the restyle tool can say what
 * someone uploaded and what it can't change: a WeChat group code still expires after 7 days.
 * Patterns are what these apps put in their codes; Tencent and Ant don't document them.
 */
import { DEFAULT_FIELDS, normalizeWebUrl, type ContentFields, type ContentType } from './index'

export type AppCode =
  | { app: 'wechat'; kind: 'contact' | 'group' | 'official-account' | 'other' }
  | { app: 'wechat-pay' }
  | { app: 'alipay' }

export function identifyAppCode(text: string): AppCode | null {
  const value = text.trim()
  if (/^wxp:\/\//i.test(value)) return { app: 'wechat-pay' }
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  const host = url.hostname.toLowerCase()
  if (host === 'u.wechat.com') return { app: 'wechat', kind: 'contact' }
  if (host === 'weixin.qq.com') {
    if (url.pathname.startsWith('/g/')) return { app: 'wechat', kind: 'group' }
    if (url.pathname.startsWith('/r/')) return { app: 'wechat', kind: 'official-account' }
    return { app: 'wechat', kind: 'other' }
  }
  if (host === 'wechat.com' || host.endsWith('.wechat.com')) return { app: 'wechat', kind: 'other' }
  if (host === 'alipay.com' || host.endsWith('.alipay.com')) return { app: 'alipay' }
  return null
}

/**
 * Generator content that encodes back to exactly `text`: a web address as a Link, anything else
 * (wxp:// and other app schemes included) as Text. Restyling must never change a single character.
 */
export function exactContent(text: string): {
  type: Extract<ContentType, 'url' | 'text'>
  fields: Partial<ContentFields>
} {
  if (/^https?:\/\//i.test(text) && normalizeWebUrl(text) === text) {
    return { type: 'url', fields: { url: { ...DEFAULT_FIELDS.url, url: text } } }
  }
  return { type: 'text', fields: { text: { ...DEFAULT_FIELDS.text, text } } }
}
