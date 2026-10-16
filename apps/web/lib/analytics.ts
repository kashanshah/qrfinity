/**
 * Site analytics: Google Analytics 4 and PostHog, both optional (set their keys to turn them on).
 *
 * Privacy rules this file keeps:
 * - Nothing loads on qrfinity.link (the redirect is a separate Worker) or on /admin.
 * - In the EU, EEA, UK and Switzerland (and when the country is unknown), no cookies until the visitor
 *   allows them: GA runs in consent mode (cookieless pings), PostHog in cookieless mode. Elsewhere
 *   analytics cookies are on by default; Cookie settings and Global Privacy Control turn them off.
 * - No session recordings, masked text, and events carry no content, links or emails.
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

/** The events we send, and the only properties each may carry. */
export type AnalyticsEvent =
  | {
      name: 'qr_downloaded'
      props: { format: string; content_type: string; kind: 'static' | 'dynamic' }
    }
  | { name: 'dynamic_code_created'; props: { content_type: string; custom_slug: boolean } }
  | { name: 'sign_in_requested'; props: { method: 'email' | 'google' } }
  | { name: 'pro_waitlist_joined'; props: Record<string, never> }
  | {
      name: 'qr_read'
      props: {
        tool: 'scanner' | 'checker' | 'restyle' | 'tester'
        source: 'image' | 'camera'
        found: boolean
        content_type: string | null
      }
    }
  | {
      name: 'link_checked'
      props: { tool: 'scanner' | 'checker'; outcome: string; known_service: boolean }
    }
  | { name: 'checkout_started'; props: { plan: string; interval: 'month' | 'year' } }
  | { name: 'upgrade_prompt_shown'; props: { feature: string } }
  | { name: 'qr_tested'; props: { verdict: string; warnings: number; failures: number } }

type Gtag = (...args: unknown[]) => void
type PostHogLike = { capture: (event: string, props?: Record<string, unknown>) => void }

declare global {
  interface Window {
    gtag?: Gtag
    __qrfinityPosthog?: PostHogLike
  }
}

/** Sends an event to whichever tools are loaded. Safe to call anywhere; a no-op when analytics is off. */
export function track<E extends AnalyticsEvent>(name: E['name'], props: E['props']) {
  if (typeof window === 'undefined' || !ANALYTICS_ENABLED) return
  try {
    window.gtag?.('event', name, props)
    window.__qrfinityPosthog?.capture(name, props)
  } catch {
    // Analytics must never break the product.
  }
}

/** Pages where analytics never loads. */
export function analyticsAllowedOn(pathname: string): boolean {
  return !pathname.startsWith('/admin')
}
