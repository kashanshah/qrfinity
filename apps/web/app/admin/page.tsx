import { adminStats, listFlaggedCodes, listReports } from '@/lib/server/admin'
import { adminContext } from '@/lib/server/context'
import { PER_PAGE_OPTIONS } from '@/lib/server/listing'
import { getReputation } from '@/lib/server/reputation'
import { REPORT_REASONS } from '@/lib/server/reports'
import { ActionButton } from './ActionButton'
import { dismissReportAction } from './actions'
import { CodeActions, CodeSummary, formatDate, ShortLink } from './CodeParts'
import { ListBar } from './ListBar'
import { cleanParams, listOptions, type RawParams } from './list-params'
import { PerPageSelect } from './PerPageSelect'
import { SearchForm } from './SearchForm'
import { SortHeader } from './SortHeader'
import { table, tableWrap, td, th, tr } from './table'

const PATH = '/admin'
const fmt = new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium', timeStyle: 'short' })

export default async function AdminQueue({ searchParams }: { searchParams: Promise<RawParams> }) {
  const params = cleanParams(await searchParams)
  const q = params.q?.trim() ?? ''
  const { db } = await adminContext()
  // Two lists on one page: reports use r-prefixed parameters, flagged codes f-prefixed ones.
  const [stats, open, flagged] = await Promise.all([
    adminStats(db),
    listReports(db, 'open', q, listOptions(params, 'r')),
    listFlaggedCodes(db, q, listOptions(params, 'f')),
  ])
  const reputation = getReputation()
  const reportHead = { current: open, path: PATH, params, prefix: 'r' }
  const flagHead = { current: flagged, path: PATH, params, prefix: 'f' }
  return (
    <div className="flex flex-col gap-8">
      <h1 className="heading text-ink">Abuse queue</h1>
      {!reputation.configured ? (
        <p
          role="alert"
          className="rounded-lg border-[1.5px] border-scan-fail bg-surface px-4 py-3 text-ink"
        >
          Google Web Risk isn’t configured (WEB_RISK_API_KEY). New destinations are only checked
          against the blocklist.
        </p>
      ) : null}
      <dl className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {[
          ['Open reports', stats.open_reports],
          ['Flagged codes', stats.flagged],
          ['Turned off', stats.disabled],
          ['Live codes', stats.codes],
          ['Users', stats.users],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-hairline bg-surface p-4">
            <dt className="label text-ink-muted">{label}</dt>
            <dd className="subheading text-ink">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-3">
        <SearchForm
          path={PATH}
          params={params}
          label="Search the queue"
          placeholder="Reported link, destination, code name or email"
        />
        <div className="flex justify-end">
          <PerPageSelect value={open.perPage} options={PER_PAGE_OPTIONS} />
        </div>
      </div>

      <section aria-labelledby="reports" className="flex flex-col gap-3">
        <h2 id="reports" className="subheading text-ink">
          Open reports
        </h2>
        <ListBar
          path={PATH}
          params={params}
          prefix="r"
          noun={q ? 'matching reports' : 'open reports'}
          perPageSelect={false}
          {...open}
        />
        {open.rows.length === 0 ? (
          <p className="text-ink-muted">{q ? 'No open reports match.' : 'No open reports.'}</p>
        ) : (
          <div className={tableWrap}>
            <table className={table}>
              <thead>
                <tr>
                  <SortHeader label="Received" sortKey="received" firstDir="desc" {...reportHead} />
                  <SortHeader label="Reason" sortKey="reason" {...reportHead} />
                  <SortHeader label="Reported" sortKey="reported" {...reportHead} />
                  <th scope="col" className={th}>
                    Code
                  </th>
                  <th scope="col" className={th}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {open.rows.map(({ report, code, ownerEmail }) => (
                  <tr key={report.id} className={tr}>
                    <td className={`${td} whitespace-nowrap`}>{fmt.format(report.createdAt)}</td>
                    <td className={`${td} whitespace-nowrap`}>
                      {REPORT_REASONS[report.reason as keyof typeof REPORT_REASONS] ??
                        report.reason}
                    </td>
                    <td className={`${td} min-w-[14rem]`}>
                      <p className="break-all">{report.reported}</p>
                      {report.details ? (
                        <p className="whitespace-pre-wrap text-ink-muted">{report.details}</p>
                      ) : null}
                      {report.reporterEmail ? (
                        <p className="break-all text-ink-muted">From {report.reporterEmail}</p>
                      ) : null}
                    </td>
                    <td className={td}>
                      {code?.id ? (
                        <div className="flex flex-col gap-2">
                          <CodeSummary code={code as Parameters<typeof CodeSummary>[0]['code']} />
                          <p className="text-ink-muted">
                            <ShortLink slug={code.slug} /> · {ownerEmail ?? 'unknown owner'}
                          </p>
                          <CodeActions code={code as Parameters<typeof CodeActions>[0]['code']} />
                        </div>
                      ) : (
                        <p className="text-ink-muted">
                          No matching QRfinity code. Search for it under Codes.
                        </p>
                      )}
                    </td>
                    <td className={td}>
                      <ActionButton
                        label="Dismiss report"
                        action={dismissReportAction.bind(null, report.id)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="flagged" className="flex flex-col gap-3">
        <h2 id="flagged" className="subheading text-ink">
          Flagged by the re-check
        </h2>
        <ListBar
          path={PATH}
          params={params}
          prefix="f"
          noun={q ? 'matching flagged codes' : 'flagged codes'}
          perPageSelect={false}
          {...flagged}
        />
        {flagged.rows.length === 0 ? (
          <p className="text-ink-muted">{q ? 'No flagged codes match.' : 'Nothing flagged.'}</p>
        ) : (
          <div className={tableWrap}>
            <table className={table}>
              <thead>
                <tr>
                  <SortHeader label="Code" sortKey="name" {...flagHead} />
                  <SortHeader label="Short link" sortKey="link" {...flagHead} />
                  <SortHeader label="Owner" sortKey="owner" {...flagHead} />
                  <th scope="col" className={th}>
                    Why
                  </th>
                  <SortHeader label="Checked" sortKey="checked" firstDir="desc" {...flagHead} />
                  <th scope="col" className={th}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {flagged.rows.map(({ code, ownerEmail }) => (
                  <tr key={code.id} className={tr}>
                    <td className={td}>
                      <CodeSummary code={code} />
                    </td>
                    <td className={td}>
                      <ShortLink slug={code.slug} />
                    </td>
                    <td className={`${td} whitespace-nowrap`}>{ownerEmail}</td>
                    <td className={`${td} text-ink-muted`}>{code.riskDetail ?? '–'}</td>
                    <td className={`${td} whitespace-nowrap`}>{formatDate(code.riskCheckedAt)}</td>
                    <td className={td}>
                      <CodeActions code={code} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
