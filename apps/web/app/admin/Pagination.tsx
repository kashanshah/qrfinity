import { ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'

const linkClass =
  'button inline-flex min-h-10 items-center gap-1 rounded-md border-[1.5px] border-control-border bg-surface px-3 text-ink hover:bg-surface-sunk'
const disabledClass =
  'button inline-flex min-h-10 items-center gap-1 rounded-md border-[1.5px] border-hairline px-3 text-ink-muted'

/** "Showing 26–50 of 312" with previous and next links that keep the other query parameters. */
export function Pagination({
  path,
  params,
  page,
  pages,
  perPage,
  total,
  noun,
}: {
  path: string
  params: Record<string, string | undefined>
  page: number
  pages: number
  perPage: number
  total: number
  /** Plural, e.g. "users". */
  noun: string
}) {
  const href = (p: number) => {
    const sp = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v)
    if (p > 1) sp.set('page', String(p))
    const qs = sp.toString()
    return qs ? `${path}?${qs}` : path
  }
  const from = total === 0 ? 0 : (page - 1) * perPage + 1
  const to = Math.min(page * perPage, total)
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3">
      <p className="body-small text-ink-muted">
        {total === 0 ? `No ${noun}` : `Showing ${from}–${to} of ${total} ${noun}`}
      </p>
      {pages > 1 ? (
        <div className="flex items-center gap-2">
          {page > 1 ? (
            <Link href={href(page - 1)} rel="prev" className={linkClass}>
              <ChevronLeft aria-hidden="true" size={16} strokeWidth={1.75} />
              Previous
            </Link>
          ) : (
            <span aria-disabled="true" className={disabledClass}>
              <ChevronLeft aria-hidden="true" size={16} strokeWidth={1.75} />
              Previous
            </span>
          )}
          <span className="body-small px-1 text-ink-muted">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Link href={href(page + 1)} rel="next" className={linkClass}>
              Next
              <ChevronRight aria-hidden="true" size={16} strokeWidth={1.75} />
            </Link>
          ) : (
            <span aria-disabled="true" className={disabledClass}>
              Next
              <ChevronRight aria-hidden="true" size={16} strokeWidth={1.75} />
            </span>
          )}
        </div>
      ) : null}
    </nav>
  )
}
