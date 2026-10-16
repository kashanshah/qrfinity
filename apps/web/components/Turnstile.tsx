'use client'

import { useEffect, useRef } from 'react'

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string
      remove: (id: string) => void
      reset: (id: string) => void
    }
  }
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

/** Cloudflare Turnstile. Renders nothing when no site key is configured (local development). */
export function Turnstile({
  siteKey,
  onToken,
}: {
  siteKey?: string
  onToken: (token: string | null) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const cb = useRef(onToken)
  useEffect(() => {
    cb.current = onToken
  })

  useEffect(() => {
    if (!siteKey || !box.current) return
    let id: string | null = null
    let cancelled = false
    const mount = () => {
      if (cancelled || !window.turnstile || !box.current) return
      id = window.turnstile.render(box.current, {
        sitekey: siteKey,
        callback: (t: string) => cb.current(t),
        'expired-callback': () => cb.current(null),
        'error-callback': () => cb.current(null),
      })
    }
    if (window.turnstile) mount()
    else {
      let s = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT}"]`)
      if (!s) {
        s = document.createElement('script')
        s.src = SCRIPT
        s.async = true
        document.head.appendChild(s)
      }
      s.addEventListener('load', mount)
    }
    return () => {
      cancelled = true
      if (id && window.turnstile) window.turnstile.remove(id)
    }
  }, [siteKey])

  return siteKey ? <div ref={box} className="min-h-[65px]" /> : null
}
