/** A small user-agent parser for scan analytics: device type, OS and browser. */

export type DeviceType = 'mobile' | 'tablet' | 'desktop' | 'bot' | 'other'
export type ParsedUserAgent = { device: DeviceType; os: string; browser: string }

const BOT =
  /bot\b|bot\/|crawler|spider|crawl|slurp|facebookexternalhit|whatsapp\/|slack|telegram|discord|preview|headless|curl\/|wget\/|python-|go-http-client|okhttp|java\//i

export function parseUserAgent(ua: string | null | undefined): ParsedUserAgent {
  const s = ua ?? ''
  if (!s.trim()) return { device: 'other', os: 'Other', browser: 'Other' }
  if (BOT.test(s)) return { device: 'bot', os: 'Other', browser: 'Bot' }

  let os = 'Other'
  if (/iPhone|iPad|iPod/.test(s)) os = 'iOS'
  else if (/Android/.test(s)) os = 'Android'
  else if (/CrOS/.test(s)) os = 'ChromeOS'
  else if (/Windows/.test(s)) os = 'Windows'
  else if (/Mac OS X|Macintosh/.test(s)) os = 'macOS'
  else if (/Linux|X11/.test(s)) os = 'Linux'

  let device: DeviceType = 'other'
  if (/iPad|Tablet/.test(s) || (/Android/.test(s) && !/Mobile/.test(s))) device = 'tablet'
  else if (/Mobi|iPhone|iPod|Android/.test(s)) device = 'mobile'
  else if (os !== 'Other') device = 'desktop'

  let browser = 'Other'
  if (/Instagram/.test(s)) browser = 'Instagram'
  else if (/FBAN|FBAV|FB_IAB/.test(s)) browser = 'Facebook'
  else if (/SamsungBrowser/.test(s)) browser = 'Samsung Internet'
  else if (/Edg(e|A|iOS)?\//.test(s)) browser = 'Edge'
  else if (/OPR\/|Opera/.test(s)) browser = 'Opera'
  else if (/Firefox|FxiOS/.test(s)) browser = 'Firefox'
  else if (/Chrome|CriOS/.test(s)) browser = 'Chrome'
  else if (/Safari/.test(s)) browser = 'Safari'

  return { device, os, browser }
}
