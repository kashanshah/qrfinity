import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

/** A collapsible group in the design panel. */
export function Section({
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  title: string
  summary?: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  return (
    <details open={defaultOpen} className="group border-t border-hairline first:border-t-0">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-sm py-3 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="subheading block text-ink">{title}</span>
          {summary ? <span className="body-small text-ink-muted">{summary}</span> : null}
        </span>
        <ChevronDown
          aria-hidden="true"
          size={20}
          strokeWidth={1.75}
          className="shrink-0 transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="flex flex-col gap-6 pb-6 pt-2">{children}</div>
    </details>
  )
}
