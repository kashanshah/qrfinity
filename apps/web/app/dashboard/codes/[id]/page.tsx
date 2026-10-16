import { CONTACT_TEMPLATES_BY_PLAN, type ContentType } from '@qrfinity/core'
import { notFound } from 'next/navigation'
import { AnalyticsView } from '@/components/analytics/AnalyticsView'
import { advancedAccess } from '@/components/dashboard/Advanced'
import { CopyButton } from '@/components/dashboard/CopyButton'
import { StatusPill } from '@/components/dashboard/StatusPill'
import { CodeTypeBadge, NeverExpiresBadge } from '@/components/generator/Badges'
import { scanReportFor } from '@/lib/server/scan-report'
import {
  ServiceError,
  advancedCodeUsage,
  destinationHistoryFor,
  getCode,
  listFolders,
  pageOf,
} from '@/lib/server/codes'
import { serviceContext } from '@/lib/server/context'
import { shortLinkBase, shortLinkFor } from '@/lib/short-link'
import { CodeSettings } from './CodeSettings'
import { EditCode } from './EditCode'
import { RenameCode } from './RenameCode'
import { PageStyleEditor } from './PageStyleEditor'
import { LimitsEditor } from './LimitsEditor'
import { PasswordEditor } from './PasswordEditor'
import { SplitEditor } from './SplitEditor'
import { RulesEditor } from './RulesEditor'

const dateTime = new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium', timeStyle: 'short' })

export default async function CodePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ days?: string; created?: string }>
}) {
  const { id } = await params
  const { days: d, created } = await searchParams
  const ctx = await serviceContext(`/dashboard/codes/${id}`)
  let code
  try {
    code = await getCode(ctx, id)
  } catch (e) {
    if (e instanceof ServiceError) notFound()
    throw e
  }
  const [history, folders, scans, usage] = await Promise.all([
    destinationHistoryFor(ctx, id),
    listFolders(ctx),
    scanReportFor(ctx, { kind: 'code', codeId: id }, d),
    advancedCodeUsage(ctx),
  ])
  const page = pageOf(code)
  // A code that already uses an advanced feature can add rules without taking another place.
  const isAdvanced =
    code.customSlug ||
    code.rules !== null ||
    code.hasPassword ||
    code.split !== null ||
    code.limits !== null
  const access = advancedAccess(usage)
  const canAddAdvanced = isAdvanced ? !code.advancedPaused : usage.used < usage.allowance
  const link = shortLinkFor(code.slug!)
  const content = code.content ?? {
    type: 'url' as ContentType,
    fields: { url: code.destination ?? '' },
  }

  return (
    <div className="flex flex-col gap-8">
      {created ? (
        <p role="status" className="rounded-lg bg-mint px-4 py-3 text-ink">
          Your dynamic code is ready. Download it below, then print it: it never expires.
        </p>
      ) : null}
      {code.status === 'disabled' ? (
        <div
          role="alert"
          className="rounded-lg border-[1.5px] border-scan-fail bg-surface px-4 py-3 text-ink"
        >
          <p className="font-bold">We turned off this code.</p>
          <p className="body-small text-ink-muted">
            {code.disabledReason ?? 'Its destination broke our acceptable use policy.'} Scans now
            show a warning page. If you think this is a mistake, contact us and we’ll review it.
          </p>
        </div>
      ) : null}

      <header className="flex flex-col gap-3">
        <RenameCode id={code.id} name={code.name} />
        <div className="flex flex-wrap items-center gap-2">
          <CodeTypeBadge type="dynamic" />
          <NeverExpiresBadge />
          <StatusPill status={code.status} />
          <span className="flex items-center">
            <span className="mono text-evergreen">{link.replace(/^https?:\/\//, '')}</span>
            <CopyButton text={link} />
          </span>
        </div>
        <p className="body-small text-ink-muted">
          Created {dateTime.format(code.createdAt)}. Last changed {dateTime.format(code.updatedAt)}.
        </p>
      </header>

      <EditCode
        id={code.id}
        shortLink={link}
        shortLinkBase={shortLinkBase()}
        content={content}
        design={code.design}
        destination={code.destination ?? ''}
        disabled={code.status === 'disabled'}
      />

      {page ? (
        <PageStyleEditor
          id={code.id}
          slug={code.slug!}
          fields={page.fields}
          style={page.style ?? { template: 'classic', accent: null }}
          templatesAllowed={CONTACT_TEMPLATES_BY_PLAN[usage.plan]}
          codeColor={
            code.design.foreground.type === 'solid'
              ? code.design.foreground.color
              : code.design.foreground.from
          }
          disabled={code.status === 'disabled'}
        />
      ) : null}

      {code.destination ? (
        <RulesEditor
          id={code.id}
          rules={code.rules ?? []}
          paused={code.advancedPaused && code.rules !== null}
          canAdd={canAddAdvanced}
          used={usage.used}
          allowance={usage.allowance}
          access={access}
          disabled={code.status === 'disabled'}
        />
      ) : null}

      {code.destination ? (
        <SplitEditor
          id={code.id}
          destination={code.destination}
          split={code.split}
          paused={code.advancedPaused && code.split !== null}
          canAdd={canAddAdvanced}
          used={usage.used}
          allowance={usage.allowance}
          access={access}
          disabled={code.status === 'disabled'}
        />
      ) : null}

      {code.destination ? (
        <LimitsEditor
          id={code.id}
          limits={code.limits}
          paused={code.advancedPaused && code.limits !== null}
          canAdd={canAddAdvanced}
          used={usage.used}
          allowance={usage.allowance}
          access={access}
          disabled={code.status === 'disabled'}
        />
      ) : null}

      <PasswordEditor
        id={code.id}
        hasPassword={code.hasPassword}
        canAdd={canAddAdvanced}
        used={usage.used}
        allowance={usage.allowance}
        access={access}
        disabled={code.status === 'disabled'}
      />

      <section aria-labelledby="analytics" className="flex flex-col gap-4">
        <h2 id="analytics" className="heading text-ink">
          Scans
        </h2>
        <AnalyticsView {...scans} basePath={`/dashboard/codes/${code.id}`} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section
          aria-labelledby="history"
          className="rounded-lg border border-hairline bg-surface p-4 md:p-6"
        >
          <h2 id="history" className="subheading mb-3 text-ink">
            Destination history
          </h2>
          <ol className="flex flex-col divide-y divide-hairline">
            {history.map((h) => (
              <li key={h.id} className="py-2">
                <p className="body-small break-all text-ink">{h.newDestination}</p>
                <p className="body-small text-ink-muted">
                  {h.oldDestination ? 'Changed' : 'Created'} {dateTime.format(h.changedAt)}
                </p>
              </li>
            ))}
          </ol>
        </section>
        <CodeSettings
          id={code.id}
          status={code.status}
          folderId={code.folderId}
          tags={code.tags}
          folders={folders.map((f) => ({ id: f.id, name: f.name }))}
        />
      </div>
    </div>
  )
}
