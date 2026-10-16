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
  readConsent,
  saveConsent,
  type Consent,
} from '@/lib/analytics'

/** PostHog goes through our own domain (/ingest, see next.config.ts) so it isn't blocked and needs no CSP entry. */
async function startPosthog(consent: Consent | null) {
  const { default: posthog } = await import('posthog-js')
  posthog.init(POSTHOG_KEY, {
    api_host: '/ingest',
    ui_host: process.env.NEXT_PUBLIC_POSTHOG_UI_HOST || 'https://us.posthog.com',
    // Cookieless until the visitor allows cookies; no capture opt-in needed for the anonymous counts.
    cookieless_mode: 'on_reject',
    opt_out_capturing_by_default: consent !== 'granted',
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
  if (consent === 'granted') posthog.opt_in_capturing()
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
  const bannerOpen = consent === null || reopened

  useEffect(() => {
    if (!ANALYTICS_ENABLED) return
    const onChange = (e: Event) => {
      const value = (e as CustomEvent<Consent>).detail
      setReopened(false)
      window.gtag?.('consent', 'update', { analytics_storage: value })
      const ph = window.__qrfinityPosthog as unknown as {
        opt_in_capturing?: () => void
        opt_out_capturing?: () => void
      }
      if (value === 'granted') ph?.opt_in_capturing?.()
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

  if (!ANALYTICS_ENABLED || consent === undefined) return null
  return (
    <>
      {allowed && GA_ID ? (
        <>
          <Script id="ga-consent" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=gtag;
gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'${consent === 'granted' ? 'granted' : 'denied'}'});
gtag('js',new Date());gtag('config','${GA_ID}',{allow_google_signals:false,allow_ad_personalization_signals:false});`}
          </Script>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
            strategy="afterInteractive"
          />
        </>
      ) : null}
      {bannerOpen && allowed ? (
        <ConsentBanner onClose={() => setReopened(false)} hasChoice={consent !== null} />
      ) : null}
    </>
  )
}

function ConsentBanner({ onClose, hasChoice }: { onClose: () => void; hasChoice: boolean }) {
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
