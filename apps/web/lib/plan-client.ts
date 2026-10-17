'use client'

import type { Feature, Plan } from '@qrfinity/core'
import { useEffect, useState } from 'react'

export type ViewerPlan = {
  signedIn: boolean
  plan: Plan
  features: Feature[]
  /** Signed up in the last hour (counts a first sign-in as a sign-up in site analytics). */
  newAccount?: boolean
}

let request: Promise<ViewerPlan> | null = null

/** Fetched once per page load; signed out (or offline) means the free plan. */
function loadPlan(): Promise<ViewerPlan> {
  request ??= fetch('/api/account/plan', { cache: 'no-store' })
    .then((r) => (r.ok ? (r.json() as Promise<ViewerPlan>) : Promise.reject(new Error())))
    .catch(() => ({ signedIn: false, plan: 'free' as const, features: [] }))
  return request
}

/** The visitor's plan, or null while it loads (or while `enabled` is false). */
export function useViewerPlan(enabled = true): ViewerPlan | null {
  const [plan, setPlan] = useState<ViewerPlan | null>(null)
  useEffect(() => {
    if (!enabled) return
    let live = true
    void loadPlan().then((p) => live && setPlan(p))
    return () => {
      live = false
    }
  }, [enabled])
  return plan
}
