'use client'

import { useEffect } from 'react'
import { trackOnce, type AnalyticsEvent } from '@/lib/analytics'

/**
 * Sends one event when it first renders, once per page load (server components can use it to
 * count what a page showed: an upgrade note, a finished checkout).
 */
export function TrackEvent<E extends AnalyticsEvent>({
  name,
  props,
  onceKey,
}: {
  name: E['name']
  props: E['props']
  /** Defaults to the event name and its properties. */
  onceKey?: string
}) {
  const key = onceKey ?? `${name}:${JSON.stringify(props)}`
  useEffect(() => {
    trackOnce(key, name, props)
    // The key covers the name and properties.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return null
}
