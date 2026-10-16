/**
 * Site analytics: Google Analytics 4 and PostHog, both optional (set their keys to turn them on).
 *
 * Privacy rules this file keeps:
 * - Nothing loads on qrfinity.link (the redirect is a separate Worker) or on /admin.
 * - No cookies until the visitor allows them. Until then GA runs in consent mode (cookieless pings)
 *   and PostHog in cookieless mode, which needs "Cookieless server hash mode" on in the project.
 * - No session recordings, masked text, and events carry no content, links or emails.
 */

export const GA_ID = process.env.NEXT_PUBLIC_GA_ID?.trim() || ''
export const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim() || ''
export const ANALYTICS_ENABLED = Boolean(GA_ID || POSTHOG_KEY)

export type Consent = 'granted' | 'denied'
const CONSENT_KEY = 'qrfinity-analytics-consent'
export const CONSENT_EVENT = 'qrfinity:consent'
export const OPEN_SETTINGS_EVENT = 'qrfinity:cookie-settings'

export function readConsent(): Consent | null {
  try {
    const v = localStorage.getItem(CONSENT_KEY)
    return v === 'granted' || v === 'denied' ? v : null
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
