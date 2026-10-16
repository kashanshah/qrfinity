import { Plus, Search } from 'lucide-react'
import Link from 'next/link'
import { CopyButton } from '@/components/dashboard/CopyButton'
import { FolderManager } from '@/components/dashboard/FolderManager'
import { StatusPill } from '@/components/dashboard/StatusPill'
import { getAnalytics } from '@/lib/server/analytics'
import { listCodes, listFolders, listTags } from '@/lib/server/codes'
import { serviceContext } from '@/lib/server/context'
import { shortLinkFor } from '@/lib/short-link'

const dateFmt = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})

function displayDestination(url: string | null) {
  if (!url) return ''
  return url.replace(/^https?:\/\/(www\.)?/, '')
}

export default async function CodesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; folder?: string; tag?: string }>
}) {
  const { q, folder, tag } = await searchParams
  const ctx = await serviceContext('/dashboard')
  const folderId = folder && /^[0-9a-f-]{36}$/i.test(folder) ? folder : null
  const analytics = getAnalytics()
  const [codes, folders, tags, totals] = await Promise.all([
    listCodes(ctx, { q, folderId, tag }),
    listFolders(ctx),
    listTags(ctx),
    analytics.codeTotals(ctx.userId).catch(() => new Map<string, number>()),
  ])
  const filtered = !!(q || folderId || tag)

  return (
    <div className="grid gap-8 md:grid-cols-[200px_minmax(0,1fr)]">
      <aside className="order-2 md:order-1">
        <FolderManager
          folders={folders.map((f) => ({ id: f.id, name: f.name }))}
          active={folderId}
        />
        {tags.length ? (
          <div className="mt-6">
            <h2 className="label mb-2 px-3 text-ink-muted">Tags</h2>
            <div className="flex flex-wrap gap-1.5 px-3">
              {tags.map((t) => (
                <Link
                  key={t.id}
                  href={
                    tag === t.name ? '/dashboard' : `/dashboard?tag=${encodeURIComponent(t.name)}`
                  }
                  aria-current={tag === t.name ? 'page' : undefined}
                  className={`label rounded-pill border-[1.5px] px-2.5 py-0.5 ${tag === t.name ? 'border-evergreen bg-mint text-ink' : 'border-control-border text-ink hover:bg-surface-sunk'}`}
                >
                  {t.name}
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </aside>

      <div className="order-1 flex min-w-0 flex-col gap-6 md:order-2">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="heading text-ink">Your codes</h1>
          <Link
            href="/dashboard/new"
            className="button inline-flex min-h-11 items-center gap-2 rounded-md bg-evergreen px-6 py-3 text-on-evergreen hover:bg-evergreen-deep"
          >
            <Plus aria-hidden="true" size={18} strokeWidth={1.75} />
            New dynamic code
          </Link>
        </div>

        <form action="/dashboard" className="flex gap-2" role="search">
          {folderId ? <input type="hidden" name="folder" value={folderId} /> : null}
          {tag ? <input type="hidden" name="tag" value={tag} /> : null}
          <label htmlFor="q" className="sr-only">
            Search codes
          </label>
          <div className="relative flex-1">
            <Search
              aria-hidden="true"
              size={18}
              strokeWidth={1.75}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
            />
            <input
              id="q"
              name="q"
              defaultValue={q}
              placeholder="Search by name, link or destination"
              className="w-full rounded-md border-[1.5px] border-control-border bg-surface py-2.5 pl-10 pr-3 text-ink"
            />
          </div>
          <button
            type="submit"
            className="button min-h-11 rounded-md border-[1.5px] border-control-border bg-surface px-5 text-ink hover:bg-surface-sunk"
          >
            Search
          </button>
        </form>

        {!analytics.live ? (
          <p className="body-small rounded-md bg-surface-sunk px-4 py-3 text-ink-muted">
            Scan counts appear once analytics is connected for this environment.
          </p>
        ) : null}

        {codes.length === 0 ? (
          <div className="rounded-lg border border-dashed border-hairline px-6 py-12 text-center">
            {filtered ? (
              <p className="text-ink-muted">
                No codes match.{' '}
                <Link href="/dashboard" className="text-evergreen underline">
                  Show all codes
                </Link>
              </p>
            ) : (
              <>
                <p className="subheading text-ink">No codes yet</p>
                <p className="mx-auto mt-2 max-w-[48ch] text-ink-muted">
                  Dynamic codes you create appear here. Change where they go any time and see who
                  scans them. Free, and they never expire.
                </p>
              </>
            )}
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-hairline rounded-lg border border-hairline bg-surface">
            {codes.map((c) => {
              const link = c.slug ? shortLinkFor(c.slug) : null
              return (
                <li
                  key={c.id}
                  className="grid gap-x-6 gap-y-1 px-4 py-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] md:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/dashboard/codes/${c.id}`}
                        className="subheading truncate text-ink hover:text-evergreen"
                      >
                        {c.name}
                      </Link>
                      <StatusPill status={c.status} />
                      {c.customSlug || c.rules ? (
                        <span
                          className="label rounded-pill border border-hairline px-2 py-0.5 text-ink-muted"
                          title={
                            c.advancedPaused && c.rules
                              ? 'Redirect rules are paused: your plan covers fewer codes with advanced features.'
                              : `Uses advanced features (${[c.customSlug ? 'custom short link' : '', c.rules ? 'redirect rules' : ''].filter(Boolean).join(', ')}). Counts toward your plan’s codes with advanced features.`
                          }
                        >
                          {c.advancedPaused && c.rules ? 'Rules paused' : 'Advanced'}
                        </span>
                      ) : null}
                    </div>
                    <p
                      className="body-small truncate text-ink-muted"
                      title={c.destination ?? undefined}
                    >
                      → {displayDestination(c.destination)}
                    </p>
                    {c.tags.length || c.folderName ? (
                      <p className="body-small mt-1 flex flex-wrap gap-1.5 text-ink-muted">
                        {c.folderName ? <span>{c.folderName}</span> : null}
                        {c.tags.map((t) => (
                          <span key={t} className="rounded-pill bg-surface-sunk px-2">
                            {t}
                          </span>
                        ))}
                      </p>
                    ) : null}
                  </div>
                  {link ? (
                    <div className="flex min-w-0 items-center gap-1">
                      <span className="mono truncate text-evergreen">
                        {link.replace(/^https?:\/\//, '')}
                      </span>
                      <CopyButton text={link} />
                    </div>
                  ) : (
                    <span />
                  )}
                  <div className="body-small flex gap-4 text-ink-muted md:flex-col md:items-end md:gap-0">
                    <span>
                      <strong className="font-bold text-ink">
                        {(totals.get(c.id) ?? 0).toLocaleString('en')}
                      </strong>{' '}
                      scans
                    </span>
                    <span>{dateFmt.format(c.createdAt)}</span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        <p className="body-small text-ink-muted">
          Scans are from the last 90 days. Every code here is free and never expires.
        </p>
      </div>
    </div>
  )
}
