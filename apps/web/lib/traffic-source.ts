/**
 * Where a visit came from, in our own channels. GA4's default grouping files ChatGPT, Perplexity
 * and other AI assistants under "Referral"; this names them, so reports can split by
 * `traffic_channel` (every event) and `first_channel` / `first_source` (user properties).
 *
 * Only the referrer's host name is kept, never its path or query (which can carry searches).
 */

export type Channel =
  'ai_assistant' | 'search' | 'social' | 'email' | 'paid' | 'qr_scan' | 'referral' | 'direct'

export type TrafficSource = { channel: Channel; source: string; medium: string; campaign: string }

// Host suffix → source name. Checked in order, so more specific hosts come first.
const AI: [string, string][] = [
  ['chatgpt.com', 'chatgpt'],
  ['chat.openai.com', 'chatgpt'],
  ['openai.com', 'chatgpt'],
  ['perplexity.ai', 'perplexity'],
  ['claude.ai', 'claude'],
  ['gemini.google.com', 'gemini'],
  ['bard.google.com', 'gemini'],
  ['copilot.microsoft.com', 'copilot'],
  ['copilot.cloud.microsoft', 'copilot'],
  ['meta.ai', 'meta_ai'],
  ['grok.com', 'grok'],
  ['x.ai', 'grok'],
  ['chat.deepseek.com', 'deepseek'],
  ['deepseek.com', 'deepseek'],
  ['chat.mistral.ai', 'mistral'],
  ['you.com', 'you'],
  ['phind.com', 'phind'],
  ['poe.com', 'poe'],
  ['kagi.com', 'kagi'],
]
const SEARCH: [string, string][] = [
  ['google.', 'google'],
  ['bing.com', 'bing'],
  ['duckduckgo.com', 'duckduckgo'],
  ['search.yahoo.', 'yahoo'],
  ['yahoo.', 'yahoo'],
  ['yandex.', 'yandex'],
  ['baidu.com', 'baidu'],
  ['ecosia.org', 'ecosia'],
  ['search.brave.com', 'brave'],
  ['naver.com', 'naver'],
  ['startpage.com', 'startpage'],
  ['qwant.com', 'qwant'],
]
const SOCIAL: [string, string][] = [
  ['facebook.com', 'facebook'],
  ['fb.com', 'facebook'],
  ['instagram.com', 'instagram'],
  ['t.co', 'x'],
  ['x.com', 'x'],
  ['twitter.com', 'x'],
  ['linkedin.com', 'linkedin'],
  ['lnkd.in', 'linkedin'],
  ['reddit.com', 'reddit'],
  ['youtube.com', 'youtube'],
  ['tiktok.com', 'tiktok'],
  ['pinterest.', 'pinterest'],
  ['threads.net', 'threads'],
  ['bsky.app', 'bluesky'],
  ['news.ycombinator.com', 'hacker_news'],
  ['quora.com', 'quora'],
  ['producthunt.com', 'product_hunt'],
  ['discord.com', 'discord'],
  ['t.me', 'telegram'],
  ['whatsapp.com', 'whatsapp'],
]
const EMAIL: [string, string][] = [
  ['mail.google.com', 'gmail'],
  ['outlook.live.com', 'outlook'],
  ['outlook.office.com', 'outlook'],
  ['mail.yahoo.com', 'yahoo_mail'],
]
// utm_source values that name an AI assistant (ChatGPT adds utm_source=chatgpt.com to links).
const AI_UTM =
  /^(chatgpt|openai|perplexity|claude|anthropic|gemini|copilot|meta[_-]?ai|grok|deepseek|mistral|you\.com|phind|poe)/i
// Our own site, and the hops of a sign-in or a checkout: coming back from them continues a visit.
const OWN_HOSTS = ['qrfinity.com', 'stripe.com', 'accounts.google.com', 'localhost']
const SCAN_HOSTS = ['qrfinity.link']

function matchHost(host: string, list: [string, string][]): string | null {
  for (const [suffix, name] of list) {
    if (suffix.endsWith('.')) {
      if (host === suffix.slice(0, -1) || host.includes(`.${suffix}`) || host.startsWith(suffix))
        return name
    } else if (host === suffix || host.endsWith(`.${suffix}`)) return name
  }
  return null
}

const tidy = (v: string | null) => (v ?? '').trim().toLowerCase().slice(0, 60)

/**
 * The channel for a landing: UTM tags first (they're deliberate), then the referrer's host.
 * Returns null for a referrer on our own site (a page-to-page click isn't a new visit).
 */
export function classifyTraffic(landingUrl: string, referrer: string): TrafficSource | null {
  let params: URLSearchParams
  try {
    params = new URL(landingUrl).searchParams
  } catch {
    params = new URLSearchParams()
  }
  let host = ''
  try {
    host = referrer ? new URL(referrer).hostname.toLowerCase().replace(/^www\./, '') : ''
  } catch {
    host = ''
  }
  if (host && OWN_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return null

  const utmSource = tidy(params.get('utm_source'))
  const medium = tidy(params.get('utm_medium'))
  const campaign = tidy(params.get('utm_campaign'))
  const paid = Boolean(params.get('gclid') || params.get('msclkid'))

  if (utmSource) {
    const channel: Channel = AI_UTM.test(utmSource)
      ? 'ai_assistant'
      : paid || /^(cpc|ppc|paid|display|cpm)/.test(medium)
        ? 'paid'
        : /e-?mail|newsletter/.test(medium)
          ? 'email'
          : /social/.test(medium)
            ? 'social'
            : /qr/.test(medium)
              ? 'qr_scan'
              : (matchHost(utmSource, AI) && 'ai_assistant') ||
                (matchHost(utmSource, SEARCH) && 'search') ||
                (matchHost(utmSource, SOCIAL) && 'social') ||
                'referral'
    return { channel, source: utmSource, medium: medium || 'none', campaign: campaign || 'none' }
  }
  if (params.get('gclid') || params.get('msclkid'))
    return {
      channel: 'paid',
      source: params.get('gclid') ? 'google' : 'bing',
      medium: 'cpc',
      campaign: campaign || 'none',
    }
  if (!host) return { channel: 'direct', source: 'direct', medium: 'none', campaign: 'none' }

  const found: [Channel, string | null][] = [
    ['ai_assistant', matchHost(host, AI)],
    ['email', matchHost(host, EMAIL)],
    ['search', matchHost(host, SEARCH)],
    ['social', matchHost(host, SOCIAL)],
    ['qr_scan', SCAN_HOSTS.some((h) => host === h) ? 'qrfinity_link' : null],
  ]
  for (const [channel, source] of found)
    if (source) return { channel, source, medium: 'referral', campaign: 'none' }
  return { channel: 'referral', source: host.slice(0, 60), medium: 'referral', campaign: 'none' }
}

const FIRST_KEY = 'qrfinity-first-touch'
const SESSION_KEY = 'qrfinity-session-touch'

/**
 * This visit's source (kept for the browser session) and the first source this browser ever
 * came from. Both are stored only when `canStore` (analytics allowed); before that, only a
 * landing from outside counts, and nothing is written. Null when there's nothing new to say.
 */
export function resolveTraffic(
  landingUrl: string,
  referrer: string,
  canStore: boolean,
): { session: TrafficSource; first: TrafficSource; isNewSession: boolean } | null {
  const read = (store: Storage | undefined, key: string): TrafficSource | null => {
    try {
      const raw = store?.getItem(key)
      return raw ? (JSON.parse(raw) as TrafficSource) : null
    } catch {
      return null
    }
  }
  const write = (store: Storage | undefined, key: string, v: TrafficSource) => {
    try {
      store?.setItem(key, JSON.stringify(v))
    } catch {
      // Private mode: the source counts for this page only.
    }
  }
  const landed = classifyTraffic(landingUrl, referrer)
  if (!canStore) return landed ? { session: landed, first: landed, isNewSession: true } : null
  const ss = typeof sessionStorage === 'undefined' ? undefined : sessionStorage
  const ls = typeof localStorage === 'undefined' ? undefined : localStorage
  const existing = read(ss, SESSION_KEY)
  // A tagged or referred landing mid-session starts a new attribution, as GA does.
  const isNewSession = !existing || (landed !== null && landed.channel !== 'direct')
  const session = isNewSession
    ? (landed ?? { channel: 'direct', source: 'direct', medium: 'none', campaign: 'none' })
    : existing
  if (isNewSession) write(ss, SESSION_KEY, session)
  let first = read(ls, FIRST_KEY)
  if (!first) {
    first = session
    write(ls, FIRST_KEY, first)
  }
  return { session, first, isNewSession }
}
