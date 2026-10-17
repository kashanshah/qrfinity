'use client'

import Link from 'next/link'
import type { ComponentProps } from 'react'
import { track, type AnalyticsEvent } from '@/lib/analytics'

/** A link that sends an event when clicked, for server components (an upgrade note's link). */
export function TrackedLink<E extends AnalyticsEvent>({
  event,
  ...props
}: ComponentProps<typeof Link> & { event: { name: E['name']; props: E['props'] } }) {
  return (
    <Link
      {...props}
      onClick={(e) => {
        track(event.name, event.props)
        props.onClick?.(e)
      }}
    />
  )
}
