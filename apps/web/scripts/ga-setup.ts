/**
 * Sets up the GA4 property for QRfinity's events (docs/analytics.md). Safe to run again: it only
 * creates what's missing and changes settings that differ.
 *
 *   GA_ACCESS_TOKEN=ya29... pnpm --filter @qrfinity/web ga:setup [--dry-run] [--property 123456789]
 *
 * The token needs the https://www.googleapis.com/auth/analytics.edit scope, from an account with
 * Editor access to the property. Without GA_ACCESS_TOKEN the script asks gcloud for one. The
 * property is found from NEXT_PUBLIC_GA_ID (G-…) unless --property is given.
 *
 * - Custom dimensions (event and user scope) and custom metrics for every parameter we report on.
 * - Key events: downloads, dynamic codes, sign-ups and the checkout steps.
 * - Data retention 14 months; Google signals off; enhanced measurement without file downloads
 *   (we send qr_downloaded ourselves).
 * - A "QRfinity channels" channel group: GA's default rules plus "AI assistants" ahead of
 *   Referral, set as the primary group so standard reports show it.
 *
 * Not in the Admin API, so still done by hand (docs/analytics.md): internal traffic and its data
 * filter, unwanted referrals, and the Search Console link.
 */
import { execFileSync } from 'node:child_process'

type Scope = 'EVENT' | 'USER'
const dim = (parameterName: string, displayName: string, scope: Scope = 'EVENT') => ({
  parameterName,
  displayName,
  scope,
})

/** Every parameter worth a report column. GA allows 50 event-scoped and 25 user-scoped. */
const DIMENSIONS = [
  dim('content_type', 'Content type'),
  dim('variant', 'Content variant'),
  dim('kind', 'Code kind'),
  dim('previous', 'Previous content type'),
  dim('format', 'Download format'),
  dim('size', 'Download size'),
  dim('scan', 'Scan check'),
  dim('surface', 'Generator surface'),
  dim('dot_style', 'Dot style'),
  dim('eye_style', 'Eye style'),
  dim('colors', 'Colours'),
  dim('gradient', 'Gradient'),
  dim('logo', 'Logo'),
  dim('frame', 'Frame'),
  dim('transparent', 'Transparent background'),
  dim('option', 'Design option'),
  dim('choice', 'Design choice'),
  dim('reason', 'Problem reason'),
  dim('warning', 'Scan warning'),
  dim('feature', 'Feature'),
  dim('code', 'Failure code'),
  dim('on', 'Feature on'),
  dim('template', 'Page template'),
  dim('custom_slug', 'Custom short link'),
  dim('folder', 'In a folder'),
  dim('from_homepage', 'From homepage'),
  dim('plan', 'Plan'),
  dim('interval', 'Billing interval'),
  dim('trial', 'Free trial'),
  dim('method', 'Sign-in method'),
  dim('action', 'Action'),
  dim('scope', 'Report scope'),
  dim('tool', 'Tool'),
  dim('input', 'Tool input'),
  dim('found', 'Code found'),
  dim('outcome', 'Link check outcome'),
  dim('known_service', 'Known service'),
  dim('verdict', 'Test verdict'),
  dim('channel', 'Channel'),
  dim('source_name', 'Source'),
  dim('source_medium', 'Source medium'),
  dim('source_campaign', 'Source campaign'),
  dim('first', 'First visit'),
  dim('traffic_channel', 'Traffic channel'),
  dim('description', 'Error'),
  dim('user_plan', 'User plan', 'USER'),
  dim('signed_in', 'Signed in', 'USER'),
  dim('first_channel', 'First channel', 'USER'),
  dim('first_source', 'First source', 'USER'),
]

const METRICS = [
  { parameterName: 'count', displayName: 'Item count' },
  { parameterName: 'saved_count', displayName: 'Saved designs' },
  { parameterName: 'days', displayName: 'Report days' },
  { parameterName: 'warnings', displayName: 'Test warnings' },
  { parameterName: 'failures', displayName: 'Test failures' },
]

const KEY_EVENTS = [
  'qr_downloaded',
  'dynamic_code_created',
  'sign_up',
  'begin_checkout',
  'subscription_started',
  'purchase',
]

const AI_SOURCES =
  'chatgpt|openai|perplexity|claude\\.ai|gemini\\.google|bard\\.google|copilot|meta\\.ai|grok|deepseek|mistral|you\\.com|phind|poe\\.com|kagi'
const CHANNEL_GROUP = 'QRfinity channels'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const flag = (name: string) => {
  const i = args.indexOf(name)
  return i > -1 ? args[i + 1] : undefined
}

function accessToken(): string {
  const env = process.env.GA_ACCESS_TOKEN?.trim()
  if (env) return env
  for (const cmd of [
    ['auth', 'application-default', 'print-access-token'],
    ['auth', 'print-access-token'],
  ]) {
    try {
      return execFileSync('gcloud', cmd, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim()
    } catch {
      // Try the next way.
    }
  }
  console.error(
    'No access token. Set GA_ACCESS_TOKEN (see docs/analytics.md, "Run the setup script").',
  )
  process.exit(1)
}

const token = accessToken()
// GA_ADMIN_API points the script at a stand-in API, for testing it.
const API = process.env.GA_ADMIN_API ?? 'https://analyticsadmin.googleapis.com/v1alpha'

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text.slice(0, 400)}`)
  return (text ? JSON.parse(text) : {}) as T
}

/** Every page of a list call. */
async function list<T>(path: string, key: string): Promise<T[]> {
  const out: T[] = []
  let pageToken = ''
  do {
    const sep = path.includes('?') ? '&' : '?'
    const r = await api<Record<string, unknown>>(
      'GET',
      `${path}${sep}pageSize=200${pageToken ? `&pageToken=${pageToken}` : ''}`,
    )
    out.push(...((r[key] as T[] | undefined) ?? []))
    pageToken = (r.nextPageToken as string | undefined) ?? ''
  } while (pageToken)
  return out
}

let changes = 0
async function change(what: string, run: () => Promise<unknown>) {
  changes++
  if (dryRun) return console.log(`would ${what}`)
  try {
    await run()
    console.log(`done: ${what}`)
  } catch (e) {
    console.error(`failed: ${what}\n  ${(e as Error).message}`)
  }
}

type Stream = {
  name: string
  type: string
  displayName?: string
  webStreamData?: { measurementId: string; defaultUri?: string }
}

/** The property and web stream for a measurement id, searched across every property we can see. */
async function findStream(measurementId: string, property?: string) {
  const properties = property
    ? [`properties/${property.replace(/^properties\//, '')}`]
    : (
        await list<{ propertySummaries?: { property: string }[] }>(
          'accountSummaries',
          'accountSummaries',
        )
      ).flatMap((a) => (a.propertySummaries ?? []).map((p) => p.property))
  for (const p of properties) {
    const streams = await list<Stream>(`${p}/dataStreams`, 'dataStreams')
    const s = streams.find((x) => x.webStreamData?.measurementId === measurementId)
    if (s) return { property: p, stream: s }
    if (property && streams.length)
      return { property: p, stream: streams.find((x) => x.type === 'WEB_DATA_STREAM') ?? null }
  }
  return null
}

async function main() {
  const measurementId = flag('--measurement-id') ?? process.env.NEXT_PUBLIC_GA_ID?.trim()
  const property = flag('--property') ?? process.env.GA_PROPERTY_ID?.trim()
  if (!measurementId && !property) {
    console.error('Set NEXT_PUBLIC_GA_ID (G-…) or pass --property <id>.')
    process.exit(1)
  }
  const found = await findStream(measurementId ?? '', property)
  if (!found) {
    console.error(`No property this account can see has a web stream ${measurementId}.`)
    process.exit(1)
  }
  const p = found.property
  console.log(
    `${dryRun ? 'Checking' : 'Setting up'} ${p}${found.stream ? ` (stream ${found.stream.webStreamData?.measurementId})` : ''}`,
  )

  // Custom dimensions and metrics.
  const dims = await list<{ parameterName: string; scope: Scope }>(
    `${p}/customDimensions`,
    'customDimensions',
  )
  for (const d of DIMENSIONS) {
    if (dims.some((x) => x.parameterName === d.parameterName && x.scope === d.scope)) continue
    await change(`add ${d.scope.toLowerCase()} dimension ${d.parameterName}`, () =>
      api('POST', `${p}/customDimensions`, d),
    )
  }
  const metrics = await list<{ parameterName: string }>(`${p}/customMetrics`, 'customMetrics')
  for (const m of METRICS) {
    if (metrics.some((x) => x.parameterName === m.parameterName)) continue
    await change(`add metric ${m.parameterName}`, () =>
      api('POST', `${p}/customMetrics`, { ...m, scope: 'EVENT', measurementUnit: 'STANDARD' }),
    )
  }

  // Key events.
  const keys = await list<{ eventName: string }>(`${p}/keyEvents`, 'keyEvents')
  for (const eventName of KEY_EVENTS) {
    if (keys.some((k) => k.eventName === eventName)) continue
    await change(`mark key event ${eventName}`, () =>
      api('POST', `${p}/keyEvents`, { eventName, countingMethod: 'ONCE_PER_EVENT' }),
    )
  }

  // Retention, Google signals, enhanced measurement.
  const retention = await api<{ eventDataRetention?: string; userDataRetention?: string }>(
    'GET',
    `${p}/dataRetentionSettings`,
  )
  if (retention.eventDataRetention === 'TWO_MONTHS' || !retention.eventDataRetention)
    await change('keep event data 14 months', () =>
      api(
        'PATCH',
        `${p}/dataRetentionSettings?updateMask=eventDataRetention,userDataRetention,resetUserDataOnNewActivity`,
        {
          eventDataRetention: 'FOURTEEN_MONTHS',
          userDataRetention: 'FOURTEEN_MONTHS',
          resetUserDataOnNewActivity: true,
        },
      ),
    )
  const signals = await api<{ state?: string }>('GET', `${p}/googleSignalsSettings`)
  if (signals.state !== 'GOOGLE_SIGNALS_DISABLED')
    await change('turn Google signals off', () =>
      api('PATCH', `${p}/googleSignalsSettings?updateMask=state`, {
        state: 'GOOGLE_SIGNALS_DISABLED',
      }),
    )
  if (found.stream) {
    const path = `${found.stream.name}/enhancedMeasurementSettings`
    const em = await api<{ streamEnabled?: boolean; fileDownloadsEnabled?: boolean }>('GET', path)
    if (!em.streamEnabled || em.fileDownloadsEnabled)
      await change('turn enhanced measurement on, without file downloads', () =>
        api('PATCH', `${path}?updateMask=streamEnabled,fileDownloadsEnabled`, {
          streamEnabled: true,
          fileDownloadsEnabled: false,
        }),
      )
  }

  // Channel group: GA's default rules, with AI assistants before Referral.
  type Filter = { fieldName?: string }
  type Expr = {
    filter?: Filter
    andGroup?: { filterExpressions: Expr[] }
    orGroup?: { filterExpressions: Expr[] }
    notExpression?: Expr
  }
  type Group = {
    name: string
    displayName: string
    systemDefined?: boolean
    primary?: boolean
    groupingRule: { displayName: string; expression: Expr }[]
  }
  const groups = await list<Group>(`${p}/channelGroups`, 'channelGroups')
  if (!groups.some((g) => g.displayName === CHANNEL_GROUP)) {
    const system = groups.find((g) => g.systemDefined)
    if (!system) {
      console.error('No default channel group to copy; skipping the AI channel group.')
    } else {
      // The source field is named as GA names it in its own rules.
      const fields = new Set<string>()
      const collect = (e?: Expr) => {
        if (!e) return
        if (e.filter?.fieldName) fields.add(e.filter.fieldName)
        e.andGroup?.filterExpressions.forEach(collect)
        e.orGroup?.filterExpressions.forEach(collect)
        collect(e.notExpression)
      }
      system.groupingRule.forEach((r) => collect(r.expression))
      const sourceField =
        [...fields].find((f) => /source$/i.test(f) && !/medium|platform/i.test(f)) ??
        'eachScopeSource'
      const ai = {
        displayName: 'AI assistants',
        expression: {
          andGroup: {
            filterExpressions: [
              {
                orGroup: {
                  filterExpressions: [
                    {
                      filter: {
                        fieldName: sourceField,
                        stringFilter: { matchType: 'PARTIAL_REGEXP', value: AI_SOURCES },
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      }
      const rules = [...system.groupingRule]
      const at = rules.findIndex((r) => r.displayName === 'Referral')
      rules.splice(at > -1 ? at : rules.length, 0, ai)
      await change(`create the "${CHANNEL_GROUP}" channel group (AI assistants) as primary`, () =>
        api('POST', `${p}/channelGroups`, {
          displayName: CHANNEL_GROUP,
          description: 'GA default channels, with AI assistants separate from Referral.',
          groupingRule: rules,
          primary: true,
        }),
      )
    }
  }

  console.log(
    changes
      ? dryRun
        ? `\n${changes} changes to make. Run again without --dry-run to apply.`
        : '\nDone.'
      : '\nEverything is already set up.',
  )
  console.log(
    'By hand (no API): internal traffic + its data filter, unwanted referrals, Search Console link. See docs/analytics.md.',
  )
}

main().catch((e) => {
  console.error((e as Error).message)
  process.exit(1)
})
