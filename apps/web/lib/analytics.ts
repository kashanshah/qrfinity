import type { Design } from '@qrfinity/core'

/**
 * Site analytics: Google Analytics 4 and PostHog, both optional (set their keys to turn them on).
 *
 * Privacy rules this file keeps:
 * - Nothing loads on qrfinity.link (the redirect is a separate Worker) or on /admin.
 * - In the EU, EEA, UK and Switzerland (and when the country is unknown), no cookies until the visitor
 *   allows them: GA runs in consent mode (cookieless pings), PostHog in cookieless mode. Elsewhere
 *   analytics cookies are on by default; Cookie settings and Global Privacy Control turn them off.
 * - No session recordings, masked text, and events carry no content, links or emails: only option
 *   names, counts and yes/no flags, checked once more by cleanProps().
 */

export const GA_ID = process.env.NEXT_PUBLIC_GA_ID?.trim() || ''
export const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim() || ''
export const ANALYTICS_ENABLED = Boolean(GA_ID || POSTHOG_KEY)

/**
 * 'granted' and 'denied' are the visitor's own choice. 'implied' means analytics is on by default
 * because the visitor is outside the EU, EEA, UK and Switzerland and hasn't chosen.
 */
export type Consent = 'granted' | 'denied' | 'implied'

export const isGranted = (c: Consent | null | undefined) => c === 'granted' || c === 'implied'

/** Global Privacy Control: a browser-wide "don't track me" we treat as "No thanks". */
export function hasPrivacySignal(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true
  )
}
const CONSENT_KEY = 'qrfinity-analytics-consent'
export const CONSENT_EVENT = 'qrfinity:consent'
export const OPEN_SETTINGS_EVENT = 'qrfinity:cookie-settings'

export function readConsent(): Consent | null {
  try {
    const v = localStorage.getItem(CONSENT_KEY)
    return v === 'granted' || v === 'denied' || v === 'implied' ? v : null
  } catch {
    return null
  }
}

export function saveConsent(value: Consent) {
  try {
    localStorage.setItem(CONSENT_KEY, value)
  } catch {
    // Private mode: the choice lasts for this page only.
  }
  window.dispatchEvent(new CustomEvent<Consent>(CONSENT_EVENT, { detail: value }))
}

/** How a design looks, as option names only: never colours, text or images. */
export type DesignProps = {
  dot_style: string
  eye_style: string
  colors: 'default' | 'custom'
  gradient: 'none' | 'linear' | 'radial'
  logo: 'none' | 'auto' | 'custom'
  frame: string
  transparent: boolean
}

export type CodeKind = 'static' | 'dynamic'
/** A feature on a dynamic code's page. */
export type CodeFeature = 'rules' | 'split' | 'password' | 'limits' | 'page_style' | 'custom_slug'
/** Why a server action failed: the ServiceError code, or `server` for anything unexpected. */
export type FailureCode = 'invalid' | 'not_found' | 'rate_limited' | 'forbidden' | 'server'

/**
 * Every event we send, and the only properties each may carry. The catalog, and the questions
 * each event answers, are in docs/analytics.md; keep the two in step.
 */
export type AnalyticsEvent =
  // Generator
  | { name: 'generator_started'; props: { content_type: string; kind: CodeKind } }
  | { name: 'code_kind_selected'; props: { kind: CodeKind } }
  | {
      name: 'content_type_selected'
      props: { content_type: string; kind: CodeKind; previous: string }
    }
  | { name: 'content_variant_selected'; props: { content_type: string; variant: string } }
  | { name: 'design_option_used'; props: { option: string; choice: string } }
  | { name: 'content_problem'; props: { content_type: string; kind: CodeKind; reason: string } }
  | { name: 'scan_check_failed'; props: { reason: string; content_type: string } }
  | { name: 'scan_warning_shown'; props: { warning: string } }
  | { name: 'design_saved'; props: { saved_count: number } }
  | { name: 'design_applied'; props: Record<string, never> }
  | {
      name: 'qr_downloaded'
      props: DesignProps & {
        format: string
        content_type: string
        variant: string
        kind: CodeKind
        size: string
        scan: 'pass' | 'fail' | 'checking'
        surface: 'generator' | 'code_page' | 'restyle'
      }
    }
  | { name: 'download_failed'; props: { format: string; kind: CodeKind } }
  | { name: 'dynamic_continue'; props: { content_type: string; signed_in: boolean } }
  | { name: 'print_partner_clicked'; props: { surface: string } }
  // Accounts
  | { name: 'sign_in_requested'; props: { method: 'email' | 'google' } }
  | { name: 'sign_in_failed'; props: { method: 'email' | 'google'; reason: string } }
  | { name: 'login'; props: { method: string } }
  | { name: 'sign_up'; props: { method: string } }
  | { name: 'account_deleted'; props: { paying: boolean } }
  // Dynamic codes
  | {
      name: 'dynamic_code_created'
      props: DesignProps & {
        content_type: string
        variant: string
        custom_slug: boolean
        folder: boolean
        from_homepage: boolean
        scan: 'pass' | 'fail' | 'checking'
      }
    }
  | { name: 'dynamic_code_create_failed'; props: { content_type: string; code: FailureCode } }
  | {
      name: 'code_updated'
      props: { content_type: string; destination: boolean; design: boolean }
    }
  | { name: 'code_update_failed'; props: { content_type: string; code: FailureCode } }
  | {
      name: 'code_feature_saved'
      props: { feature: CodeFeature; on: boolean; count: number; template?: string }
    }
  | { name: 'code_feature_failed'; props: { feature: CodeFeature; code: FailureCode } }
  | {
      name: 'code_managed'
      props: { action: 'move' | 'tags' | 'pause' | 'resume' | 'duplicate' | 'delete' | 'rename' }
    }
  | { name: 'folder_managed'; props: { action: 'create' | 'rename' | 'delete' } }
  | { name: 'scan_report_viewed'; props: { days: number; scope: 'code' | 'all' } }
  | { name: 'scan_report_exported'; props: { days: number; scope: 'code' | 'all' } }
  | { name: 'short_link_copied'; props: Record<string, never> }
  // Plans and billing
  | { name: 'upgrade_prompt_shown'; props: { feature: string } }
  | { name: 'upgrade_prompt_clicked'; props: { feature: string } }
  | { name: 'plan_interval_selected'; props: { interval: 'month' | 'year' } }
  | {
      name: 'begin_checkout'
      props: { plan: string; interval: 'month' | 'year'; value: number; currency: 'USD' }
    }
  | { name: 'checkout_cancelled'; props: Record<string, never> }
  | {
      name: 'subscription_started'
      props: { plan: string; interval: string; trial: boolean; value: number; currency: 'USD' }
    }
  | {
      name: 'purchase'
      props: {
        transaction_id: string
        plan: string
        interval: string
        value: number
        currency: 'USD'
      }
    }
  | { name: 'billing_portal_opened'; props: { plan: string } }
  | { name: 'pro_waitlist_joined'; props: Record<string, never> }
  // Tools
  | {
      name: 'qr_read'
      props: {
        tool: 'scanner' | 'checker' | 'restyle' | 'tester'
        input: 'image' | 'camera'
        found: boolean
        content_type: string | null
      }
    }
  | {
      name: 'link_checked'
      props: { tool: 'scanner' | 'checker'; outcome: string; known_service: boolean }
    }
  | { name: 'qr_tested'; props: { verdict: string; warnings: number; failures: number } }
  | { name: 'abuse_report_submitted'; props: { reason: string } }
  // Acquisition
  | {
      name: 'traffic_source'
      props: {
        channel: string
        source_name: string
        source_medium: string
        source_campaign: string
        first: boolean
      }
    }
  // Reliability
  | { name: 'exception'; props: { description: string; fatal: boolean; source: string } }

type Gtag = (...args: unknown[]) => void
type PostHogLike = {
  capture: (event: string, props?: Record<string, unknown>) => void
  register?: (props: Record<string, unknown>) => void
}

declare global {
  interface Window {
    gtag?: Gtag
    __qrfinityPosthog?: PostHogLike
  }
}

// What a code holds never leaves the browser. Every value is checked once more here, so a
// mistake at a call site drops the value instead of sending someone's link or email.
const LOOKS_PERSONAL = /[@/\\]|https?:|www\.|\.[a-z]{2,}(?:$|[/?#])|\d{6,}/i

// A Stripe object id (cs_…, sub_…): opaque, and what GA needs to count a purchase once.
const STRIPE_ID = /^[a-z]{2,4}_[A-Za-z0-9_]{8,200}$/

// Traffic sources: a host name or a UTM tag (chatgpt.com, newsletter), never a path or query.
const SOURCE_KEYS = new Set(['source_name', 'first_source', 'source_medium', 'source_campaign'])
const SOURCE_NAME = /^[a-z0-9][a-z0-9._-]{0,59}$/

/** Keeps short, safe option names and numbers; drops anything that could be content. */
export function cleanProps(
  props: Record<string, unknown>,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(props).slice(0, 25)) {
    if (key === 'transaction_id' && typeof value === 'string' && STRIPE_ID.test(value))
      out[key] = value
    else if (SOURCE_KEYS.has(key) && typeof value === 'string' && SOURCE_NAME.test(value))
      out[key] = value
    else if (typeof value === 'number' && Number.isFinite(value)) out[key] = value
    else if (typeof value === 'boolean') out[key] = value
    else if (typeof value === 'string' && value && !LOOKS_PERSONAL.test(value))
      out[key] = value.slice(0, 100)
    else if (value === null) out[key] = 'none'
  }
  return out
}

/** Sends an event to whichever tools are loaded. Safe to call anywhere; a no-op when analytics is off. */
export function track<E extends AnalyticsEvent>(name: E['name'], props: E['props']) {
  if (typeof window === 'undefined' || !ANALYTICS_ENABLED) return
  try {
    const clean = cleanProps(props)
    window.gtag?.('event', name, clean)
    window.__qrfinityPosthog?.capture(name, clean)
  } catch {
    // Analytics must never break the product.
  }
}

const sent = new Set<string>()

/**
 * Like track(), but at most once per page load for each `key`, for things that can happen on
 * every keystroke (a design option tried, a scan warning shown).
 */
export function trackOnce<E extends AnalyticsEvent>(
  key: string,
  name: E['name'],
  props: E['props'],
) {
  if (sent.has(key)) return
  sent.add(key)
  track(name, props)
}

/**
 * Who the visitor is, in broad strokes (signed in or not, which plan, the channel they first
 * came from). Set as user properties so every report can be split by them. Never an id or an email.
 */
export function setAnalyticsUser(user: Record<string, string>) {
  if (typeof window === 'undefined' || !ANALYTICS_ENABLED) return
  const props = cleanProps(user)
  try {
    window.gtag?.('set', 'user_properties', props)
    window.__qrfinityPosthog?.register?.(props)
  } catch {
    // Analytics must never break the product.
  }
}

type DesignLike = Pick<
  Design,
  | 'dotStyle'
  | 'eyeFrameStyle'
  | 'eyeBallStyle'
  | 'foreground'
  | 'background'
  | 'eyeFrameColor'
  | 'eyeBallColor'
  | 'transparentBackground'
  | 'logo'
  | 'logoAuto'
  | 'frame'
>

/** The design as option names, for downloads and created codes. */
export function designProps(d: DesignLike): DesignProps {
  const defaultColors =
    d.foreground.type === 'solid' &&
    d.foreground.color.toLowerCase() === '#000000' &&
    d.background.toLowerCase() === '#ffffff' &&
    d.eyeFrameColor === null &&
    d.eyeBallColor === null
  return {
    dot_style: d.dotStyle,
    eye_style: `${d.eyeFrameStyle}-${d.eyeBallStyle}`,
    colors: defaultColors ? 'default' : 'custom',
    gradient: d.foreground.type === 'solid' ? 'none' : d.foreground.type,
    logo: !d.logo ? 'none' : d.logoAuto ? 'auto' : 'custom',
    frame: d.frame.style,
    transparent: d.transparentBackground,
  }
}

/** The sub-choice inside a content type (social platform, app store, payment method, Wi-Fi security). */
export function contentVariant(type: string, fields: unknown): string {
  const f = (fields ?? {}) as Record<string, unknown>
  const pick =
    type === 'social'
      ? f.platform
      : type === 'app'
        ? f.store
        : type === 'payment'
          ? f.method
          : type === 'wifi'
            ? f.encryption
            : null
  return typeof pick === 'string' ? pick : 'none'
}

/**
 * Parameters added to every later event on this page (the visit's channel), so any report,
 * downloads or sign-ups say, can be split by where people came from.
 */
export function setEventDefaults(params: Record<string, string>) {
  if (typeof window === 'undefined' || !ANALYTICS_ENABLED) return
  try {
    window.gtag?.('set', cleanProps(params))
    window.__qrfinityPosthog?.register?.(cleanProps(params))
  } catch {
    // Analytics must never break the product.
  }
}

/** An error as "TypeError: message", or just its name when the message might hold content. */
export function errorText(e: unknown): string {
  const err = e instanceof Error ? e : null
  const name = err?.name || (typeof e === 'string' ? 'Error' : 'Unknown')
  const message = (err?.message ?? (typeof e === 'string' ? e : '')).slice(0, 80)
  return message && !LOOKS_PERSONAL.test(message) ? `${name}: ${message}` : name
}

/** GA's debug view, for checking events: ?ga_debug=1 on any page, or NEXT_PUBLIC_GA_DEBUG=true. */
export function gaDebug(): boolean {
  if (process.env.NEXT_PUBLIC_GA_DEBUG === 'true') return true
  try {
    return new URLSearchParams(window.location.search).get('ga_debug') === '1'
  } catch {
    return false
  }
}

/** A sign-in started on this device, so the next signed-in page can count it as a login or sign-up. */
const PENDING_SIGN_IN_KEY = 'qrfinity-sign-in-pending'

export function markSignInPending(method: 'email' | 'google') {
  try {
    localStorage.setItem(PENDING_SIGN_IN_KEY, JSON.stringify({ method, at: Date.now() }))
  } catch {
    // Private mode: the login just isn't counted.
  }
}

/** The method of a sign-in started here in the last hour, once; null otherwise. */
export function takePendingSignIn(): string | null {
  try {
    const raw = localStorage.getItem(PENDING_SIGN_IN_KEY)
    if (!raw) return null
    localStorage.removeItem(PENDING_SIGN_IN_KEY)
    const { method, at } = JSON.parse(raw) as { method: string; at: number }
    return Date.now() - at < 60 * 60 * 1000 ? method : null
  } catch {
    return null
  }
}

/** Pages where analytics never loads. */
export function analyticsAllowedOn(pathname: string): boolean {
  return !pathname.startsWith('/admin')
}
