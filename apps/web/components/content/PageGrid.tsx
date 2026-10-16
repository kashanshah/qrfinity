import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
import type { ContentPage } from '@/content/registry'

/** A grid of page cards (label + promise line), used by hubs, the home page and the footer areas. */
export function PageGrid({
  pages,
  columns = 'sm:grid-cols-2 lg:grid-cols-3',
}: {
  pages: ContentPage[]
  columns?: string
}) {
  return (
    <ul className={`grid gap-3 ${columns}`}>
      {pages.map((p) => (
        <li key={p.path}>
          <Link
            href={p.path}
            className="group flex h-full flex-col gap-1 rounded-lg border border-hairline bg-surface p-4 hover:border-evergreen"
          >
            <span className="flex items-center justify-between gap-2 font-bold text-ink">
              {p.label}
              <ArrowRight
                aria-hidden="true"
                size={18}
                strokeWidth={1.75}
                className="shrink-0 text-evergreen transition-transform group-hover:translate-x-0.5"
              />
            </span>
            <span className="body-small text-ink-muted">{p.intro}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
