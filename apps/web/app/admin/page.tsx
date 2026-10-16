import { adminStats, listFlaggedCodes, listReports } from '@/lib/server/admin'
import { adminContext } from '@/lib/server/context'
import { getReputation } from '@/lib/server/reputation'
import { REPORT_REASONS } from '@/lib/server/reports'
import { ActionButton } from './ActionButton'
import { CodeRow } from './CodeRow'
import { dismissReportAction } from './actions'

const fmt = new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium', timeStyle: 'short' })

export default async function AdminQueue() {
  const { db } = await adminContext()
  const [stats, open, flagged] = await Promise.all([
    adminStats(db),
    listReports(db, 'open'),
    listFlaggedCodes(db),
  ])
  const reputation = getReputation()
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

      <section aria-labelledby="reports">
        <h2 id="reports" className="subheading mb-2 text-ink">
          Open reports
        </h2>
        {open.length === 0 ? (
          <p className="text-ink-muted">No open reports.</p>
        ) : (
          <ul className="divide-y divide-hairline rounded-lg border border-hairline bg-surface px-4">
            {open.map(({ report, code, ownerEmail }) => (
              <li key={report.id} className="py-3">
                <p className="body-small text-ink-muted">
                  {fmt.format(report.createdAt)} ·{' '}
                  {REPORT_REASONS[report.reason as keyof typeof REPORT_REASONS] ?? report.reason}
                  {report.reporterEmail ? ` · from ${report.reporterEmail}` : ''}
                </p>
                <p className="break-all text-ink">Reported: {report.reported}</p>
                {report.details ? (
                  <p className="body-small whitespace-pre-wrap text-ink">{report.details}</p>
                ) : null}
                {code?.id ? (
                  <CodeRow
                    code={code as Parameters<typeof CodeRow>[0]['code']}
                    ownerEmail={ownerEmail}
                  />
                ) : (
                  <p className="body-small text-ink-muted">
                    No matching QRfinity code. Search for it under Codes.
                  </p>
                )}
                <ActionButton
                  label="Dismiss report"
                  action={dismissReportAction.bind(null, report.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="flagged">
        <h2 id="flagged" className="subheading mb-2 text-ink">
          Flagged by the re-check
        </h2>
        {flagged.length === 0 ? (
          <p className="text-ink-muted">Nothing flagged.</p>
        ) : (
          <div className="divide-y divide-hairline rounded-lg border border-hairline bg-surface px-4">
            {flagged.map(({ code, ownerEmail }) => (
              <CodeRow key={code.id} code={code} ownerEmail={ownerEmail} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
