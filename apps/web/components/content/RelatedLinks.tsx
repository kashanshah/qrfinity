import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { getPage } from '@/content/registry'

/** Internal links to related use cases and guides, from the registry. */
export function RelatedLinks({
  related = [],
  guides = [],
  relatedHeading = 'Related QR codes',
}: {
  related?: string[]
  guides?: string[]
  relatedHeading?: string
}) {
  if (!related.length && !guides.length) return null
  const card = (path: string) => {
    const p = getPage(path)
    return (
      <li key={path}>
        <Link
          href={path}
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
    )
  }
  return (
    <section aria-labelledby="related" className="mt-12 grid gap-8 md:grid-cols-2">
      {related.length ? (
        <div>
          <h2 id="related" className="subheading mb-3 text-ink">
            {relatedHeading}
          </h2>
          <ul className="grid gap-3">{related.map(card)}</ul>
        </div>
      ) : null}
      {guides.length ? (
        <div>
          <h2 className="subheading mb-3 text-ink">Guides</h2>
          <ul className="grid gap-3">{guides.map(card)}</ul>
        </div>
      ) : null}
    </section>
  )
}
