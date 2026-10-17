import Link from 'next/link'
import { adminContext } from '@/lib/server/context'
import { getFileStore } from '@/lib/server/file-store'
import { listStudy, loadStudySummary, photosFor } from '@/lib/server/study'
import { CATEGORY_LABEL, percent, type StudyCategory, type Tally } from '@/lib/study'
import { ActionButton } from '../ActionButton'
import { deleteStudyEntryAction, studyByHandAction } from '../actions'
import { formatDate } from '../CodeParts'
import { ListBar } from '../ListBar'
import { cleanParams, hrefWith, listOptions, type RawParams } from '../list-params'
import { SearchForm } from '../SearchForm'
import { SortHeader } from '../SortHeader'
import { table, tableWrap, td, th, tr } from '../table'
import { RecheckButton } from './RecheckButton'
import { StudyUploader } from './StudyUploader'

const PATH = '/admin/study'

const FILTERS = [
  [undefined, 'All codes'],
  ['failing', 'Failing links'],
  ['by-hand', 'Verify by hand'],
] as const

const categoryLabel = (c: string) => CATEGORY_LABEL[c as StudyCategory] ?? c

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border border-hairline bg-surface p-4">
      <p className="body-small text-ink-muted">{label}</p>
      <p className="heading text-ink">{value}</p>
      {note ? <p className="body-small text-ink-muted">{note}</p> : null}
    </div>
  )
}

function TallyTable({
  title,
  rows,
  label = (s: string) => s,
  total,
}: {
  title: string
  rows: (Tally & { total?: number })[]
  label?: (s: string) => string
  total?: boolean
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="label font-bold text-ink">{title}</h3>
      {rows.length === 0 ? (
        <p className="body-small text-ink-muted">Nothing yet.</p>
      ) : (
        <div className={tableWrap}>
          <table className={table}>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className={tr}>
                  <td className={td}>{label(r.label)}</td>
                  <td className={`${td} text-right tabular-nums`}>
                    {r.count}
                    {total && r.total !== undefined ? ` of ${r.total}` : ''}
                  </td>
                  <td className={`${td} text-right tabular-nums`}>{percent(r.share)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default async function AdminStudy({ searchParams }: { searchParams: Promise<RawParams> }) {
  const params = cleanParams(await searchParams)
  const { db } = await adminContext()
  const [s, list] = await Promise.all([
    loadStudySummary(db),
    listStudy(db, params.q ?? '', params.filter, listOptions(params)),
  ])
  const photos = await photosFor(
    db,
    list.rows.map((r) => r.id),
  )
  const head = { current: list, path: PATH, params }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="heading text-ink">Dead QR codes study</h1>
        <p className="max-w-[72ch] text-ink-muted">
          Photograph QR codes in public places, and each link is followed the way the QR code
          checker does. A link counts as dead once it has failed checks at least a day apart, or
          when someone opens it by hand and it doesn’t work. Method and publishing rules:{' '}
          <span className="mono">docs/data-story.md</span>.
        </p>
      </div>

      <StudyUploader storage={getFileStore().configured} />

      <section aria-labelledby="results" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="results" className="subheading text-ink">
            Results so far
          </h2>
          <a href={`${PATH}/export`} className="body-small text-evergreen underline">
            Download CSV
          </a>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Photos" value={String(s.photos)} note={`${s.codes} different codes`} />
          <Stat
            label="Links"
            value={String(s.links)}
            note={`${s.codes - s.links - s.unreadable} other codes, ${s.unreadable} unreadable`}
          />
          <Stat
            label="Dead links"
            value={percent(s.deadShare)}
            note={`${s.dead} of ${s.links}, confirmed`}
          />
          <Stat
            label="Not confirmed yet"
            value={String(s.pending)}
            note={`${s.verifyByHand} to verify by hand`}
          />
        </div>
        <RecheckButton due={s.due} />
        <div className="grid gap-6 lg:grid-cols-2">
          <TallyTable title="Why dead links died" rows={s.deadByReason} />
          <TallyTable
            title="Dead share by where they were"
            rows={s.deadRateByCategory}
            label={categoryLabel}
            total
          />
          <TallyTable
            title="Short links vs direct links (dead)"
            rows={[
              {
                label: 'Through a short link',
                count: s.shortLinks.dead,
                total: s.shortLinks.total,
                share: s.shortLinks.share,
              },
              {
                label: 'Direct to the page',
                count: s.directLinks.dead,
                total: s.directLinks.total,
                share: s.directLinks.share,
              },
            ]}
            total
          />
          <TallyTable title="Dead links by QR service" rows={s.deadByService} />
        </div>
      </section>

      <section aria-labelledby="codes" className="flex flex-col gap-4">
        <h2 id="codes" className="subheading text-ink">
          Codes
        </h2>
        <nav aria-label="Filter codes" className="flex flex-wrap gap-1">
          {FILTERS.map(([f, label]) => (
            <Link
              key={label}
              href={hrefWith(PATH, params, { filter: f, page: undefined })}
              aria-current={params.filter === f ? 'page' : undefined}
              className="label rounded-md px-3 py-2 text-ink hover:bg-surface-sunk aria-[current=page]:bg-mint"
            >
              {label}
            </Link>
          ))}
        </nav>
        <SearchForm
          path={PATH}
          params={params}
          label="Search the study"
          placeholder="Link, city, service, notes or photo name"
        />
        <ListBar path={PATH} params={params} noun="codes" {...list} />
        {list.rows.length === 0 ? (
          <p className="text-ink-muted">No codes yet. Add photos above.</p>
        ) : (
          <div className={tableWrap}>
            <table className={table}>
              <thead>
                <tr>
                  <th scope="col" className={th}>
                    Photo
                  </th>
                  <SortHeader label="Link or content" sortKey="link" {...head} />
                  <SortHeader label="Where" sortKey="category" {...head} />
                  <SortHeader label="Result" sortKey="result" {...head} />
                  <SortHeader label="Last checked" sortKey="checked" firstDir="desc" {...head} />
                  <th scope="col" className={th}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map((r) => {
                  const ids = photos.get(r.id) ?? []
                  return (
                    <tr key={r.id} className={tr}>
                      <td className={td}>
                        <div className="flex gap-1">
                          {ids.slice(0, 3).map((pid) => (
                            <a
                              key={pid}
                              href={`/api/admin/study/photo/${pid}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element -- private, admin-only file */}
                              <img
                                src={`/api/admin/study/photo/${pid}`}
                                alt={`Photo of the code${r.city ? ` in ${r.city}` : ''}`}
                                loading="lazy"
                                className="size-14 rounded-md border border-hairline object-cover"
                              />
                            </a>
                          ))}
                          {ids.length === 0 ? <span className="text-ink-muted">–</span> : null}
                        </div>
                      </td>
                      <td className={`${td} max-w-[320px]`}>
                        {r.url ? (
                          <span className="mono break-all">{r.url}</span>
                        ) : (
                          <span className="text-ink-muted">{r.contentType}</span>
                        )}
                        {r.service ? <p className="text-ink-muted">via {r.service}</p> : null}
                        {r.timesSeen > 1 ? (
                          <p className="text-ink-muted">Seen {r.timesSeen} times</p>
                        ) : null}
                      </td>
                      <td className={td}>
                        {categoryLabel(r.category)}
                        <p className="text-ink-muted">
                          {[r.city, r.country].filter(Boolean).join(', ') || '–'}
                          {r.takenOn ? (
                            <span className="whitespace-nowrap"> · {r.takenOn}</span>
                          ) : null}
                        </p>
                        {r.notes ? <p className="text-ink-muted">{r.notes}</p> : null}
                      </td>
                      <td className={td}>
                        {r.reason ?? 'Not checked yet'}
                        {r.httpStatus ? (
                          <p className="text-ink-muted">HTTP {r.httpStatus}</p>
                        ) : null}
                        {r.finalUrl && r.finalUrl !== r.url ? (
                          <p className="mono break-all text-ink-muted">→ {r.finalUrl}</p>
                        ) : null}
                      </td>
                      <td className={`${td} whitespace-nowrap`}>
                        {formatDate(r.lastCheckedAt)}
                        <p className="text-ink-muted">
                          {r.checks.length} {r.checks.length === 1 ? 'check' : 'checks'}
                        </p>
                      </td>
                      <td className={td}>
                        <div className="flex flex-col items-start gap-1">
                          {r.url ? (
                            <>
                              <ActionButton
                                label="Works"
                                action={studyByHandAction.bind(null, r.id, true)}
                              />
                              <ActionButton
                                label="Doesn’t work"
                                action={studyByHandAction.bind(null, r.id, false)}
                              />
                            </>
                          ) : null}
                          <ActionButton
                            label="Delete"
                            tone="danger"
                            action={deleteStudyEntryAction.bind(null, r.id)}
                            confirmText="Delete this code and its photos from the study?"
                          />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
