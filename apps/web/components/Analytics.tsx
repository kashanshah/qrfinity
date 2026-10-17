'use client'

import { usePathname } from 'next/navigation'
import Script from 'next/script'
import { useEffect, useState, useSyncExternalStore } from 'react'
import {
  ANALYTICS_ENABLED,
  CONSENT_EVENT,
  GA_ID,
  OPEN_SETTINGS_EVENT,
  POSTHOG_KEY,
  analyticsAllowedOn,
  errorText,
  gaDebug,
  hasPrivacySignal,
  isGranted,
  readConsent,
  saveConsent,
  setAnalyticsUser,
  setEventDefaults,
  takePendingSignIn,
  track,
  trackOnce,
  type Consent,
} from '@/lib/analytics'
import { useViewerPlan } from '@/lib/plan-client'
import { resolveTraffic } from '@/lib/traffic-source'

/** PostHog goes through our own domain (/ingest, see next.config.ts) so it isn't blocked and needs no CSP entry. */
async function startPosthog(consent: Consent | null) {
  const { default: posthog } = await import('posthog-js')
  posthog.init(POSTHOG_KEY, {
    api_host: '/ingest',
    ui_host: process.env.NEXT_PUBLIC_POSTHOG_UI_HOST || 'https://us.posthog.com',
    // Cookieless until the visitor allows cookies; no capture opt-in needed for the anonymous counts.
    cookieless_mode: 'on_reject',
    opt_out_capturing_by_default: !isGranted(consent),
    person_profiles: 'identified_only',
    capture_pageview: 'history_change',
    capture_pageleave: true,
    // Clicks on links and buttons only, with their text masked: generator inputs (Wi-Fi passwords,
    // links, contact details) are never captured.
    autocapture: { dom_event_allowlist: ['click'], element_allowlist: ['a', 'button'] },
    mask_all_text: true,
    mask_all_element_attributes: true,
    disable_session_recording: true,
    disable_surveys: true,
    advanced_disable_flags: true,
  })
  if (isGranted(consent)) posthog.opt_in_capturing()
  window.__qrfinityPosthog = posthog
  return posthog
}

const subscribeConsent = (onChange: () => void) => {
  window.addEventListener(CONSENT_EVENT, onChange)
  return () => window.removeEventListener(CONSENT_EVENT, onChange)
}

export function Analytics() {
  const path = usePathname()
  const allowed = ANALYTICS_ENABLED && analyticsAllowedOn(path)
  // 'server' during prerender (nothing renders), 'unset' before the visitor has chosen.
  const stored = useSyncExternalStore(
    subscribeConsent,
    () => readConsent() ?? 'unset',
    () => 'server' as const,
  )
  const consent: Consent | null | undefined =
    stored === 'server' ? undefined : stored === 'unset' ? null : stored
  const [reopened, setReopened] = useState(false)
  // Only ask where the law requires it; null until we know (no banner flash elsewhere).
  const [mustAsk, setMustAsk] = useState<boolean | null>(null)
  const bannerOpen = (consent === null && mustAsk === true) || reopened

  useEffect(() => {
    if (!ANALYTICS_ENABLED || consent !== null || mustAsk !== null) return
    let cancelled = false
    fetch('/api/consent-region')
      .then((r) => (r.ok ? (r.json() as Promise<{ required: boolean }>) : { required: true }))
      .catch(() => ({ required: true }))
      .then(({ required }) => {
        if (cancelled) return
        if (required) setMustAsk(true)
        // Outside the EU/UK: on by default, unless the browser sends Global Privacy Control.
        else saveConsent(hasPrivacySignal() ? 'denied' : 'implied')
      })
    return () => {
      cancelled = true
    }
  }, [consent, mustAsk])

  useEffect(() => {
    if (!ANALYTICS_ENABLED) return
    const onChange = (e: Event) => {
      const value = (e as CustomEvent<Consent>).detail
      setReopened(false)
      window.gtag?.('consent', 'update', {
        analytics_storage: isGranted(value) ? 'granted' : 'denied',
      })
      const ph = window.__qrfinityPosthog as unknown as {
        opt_in_capturing?: () => void
        opt_out_capturing?: () => void
      }
      if (isGranted(value)) ph?.opt_in_capturing?.()
      else ph?.opt_out_capturing?.()
    }
    const onOpen = () => setReopened(true)
    window.addEventListener(CONSENT_EVENT, onChange)
    window.addEventListener(OPEN_SETTINGS_EVENT, onOpen)
    return () => {
      window.removeEventListener(CONSENT_EVENT, onChange)
      window.removeEventListener(OPEN_SETTINGS_EVENT, onOpen)
    }
  }, [])

  useEffect(() => {
    if (!allowed || !POSTHOG_KEY || consent === undefined || window.__qrfinityPosthog) return
    void startPosthog(consent)
  }, [allowed, consent])

  // Plan and signed-in state go on every event; a sign-in started here counts once it lands.
  const viewer = useViewerPlan(allowed)
  useEffect(() => {
    if (!viewer) return
    setAnalyticsUser({ signed_in: viewer.signedIn ? 'yes' : 'no', plan: viewer.plan })
    if (!viewer.signedIn) return
    const method = takePendingSignIn()
    if (method) track(viewer.newAccount ? 'sign_up' : 'login', { method })
  }, [viewer])

  // Where this visit came from (AI assistants get their own channel), once per page load.
  useEffect(() => {
    if (!allowed || consent === undefined) return
    const t = resolveTraffic(window.location.href, document.referrer, isGranted(consent))
    if (!t) return
    setEventDefaults({ traffic_channel: t.session.channel })
    setAnalyticsUser({ first_channel: t.first.channel, first_source: t.first.source })
    if (t.isNewSession)
      trackOnce('traffic_source', 'traffic_source', {
        ...t.session,
        first: t.first === t.session,
      })
    // Once per page load: a consent change mid-page doesn't make it a new visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, consent === undefined])

  // Errors that reach the window: how often the product breaks, and where (page_location).
  useEffect(() => {
    if (!allowed) return
    let count = 0
    const report = (e: unknown, source: string) => {
      if (++count > 10) return
      const description = errorText(e)
      trackOnce(`exception:${description}`, 'exception', { description, fatal: false, source })
    }
    const onError = (e: ErrorEvent) => report(e.error ?? e.message, 'window')
    const onRejection = (e: PromiseRejectionEvent) => report(e.reason, 'promise')
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [allowed])

  if (!ANALYTICS_ENABLED || consent === undefined) return null
  return (
    <>
      {allowed && GA_ID ? (
        <>
          <Script id="ga-consent" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=gtag;
gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'${isGranted(consent) ? 'granted' : 'denied'}'});
gtag('js',new Date());gtag('config','${GA_ID}',{allow_google_signals:false,allow_ad_personalization_signals:false${gaDebug() ? ',debug_mode:true' : ''}});`}
          </Script>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
            strategy="afterInteractive"
          />
        </>
      ) : null}
      {bannerOpen && allowed ? (
        <ConsentBanner onClose={() => setReopened(false)} current={consent ?? null} />
      ) : null}
    </>
  )
}

function ConsentBanner({ onClose, current }: { onClose: () => void; current: Consent | null }) {
  const hasChoice = current !== null
  return (
    <div
      role="region"
      aria-label="Cookie choice"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-[560px] rounded-lg border border-hairline bg-surface p-4 shadow-card md:p-5"
    >
      <p className="text-ink">
        Can we use analytics cookies to see which pages help people? No ads, no selling data, and
        nothing you type into the generator.{' '}
        <a href="/privacy" className="text-evergreen underline">
          Privacy policy
        </a>
      </p>
      {hasChoice ? (
        <p className="body-small mt-1 text-ink-muted">
          Analytics cookies are {isGranted(current) ? 'on' : 'off'} right now.
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => saveConsent('granted')}
          className="button min-h-11 rounded-md bg-evergreen px-5 text-on-evergreen hover:bg-evergreen-deep"
        >
          Allow
        </button>
        <button
          type="button"
          onClick={() => saveConsent('denied')}
          className="button min-h-11 rounded-md border-[1.5px] border-control-border bg-surface px-5 text-ink hover:bg-surface-sunk"
        >
          No thanks
        </button>
        {hasChoice ? (
          <button
            type="button"
            onClick={onClose}
            className="label ml-auto rounded-md px-3 text-ink-muted hover:text-ink"
          >
            Close
          </button>
        ) : null}
      </div>
    </div>
  )
}

/** "Cookie settings" in the footer: reopens the choice. Hidden when analytics is off. */
export function CookieSettingsLink({ className }: { className?: string }) {
  if (!ANALYTICS_ENABLED) return null
  return (
    <button
      type="button"
      className={className}
      onClick={() => window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT))}
    >
      Cookie settings
    </button>
  )
}
