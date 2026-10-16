import type { CloudflareUsage, UsageDay } from '@qrfinity/core'
import { env } from './env'

const GRAPHQL = 'https://api.cloudflare.com/client/v4/graphql'

/** Only our Workers count: other scripts in the account (if any) are ignored. */
export const OUR_WORKERS = ['qrfinity-redirect', 'qrfinity-edge-api']

const QUERY = `query Usage($account: String!, $from: Date!, $to: Date!) {
  viewer {
    accounts(filter: { accountTag: $account }) {
      workers: workersInvocationsAdaptive(limit: 1000, filter: { date_geq: $from, date_leq: $to }) {
        sum { requests }
        dimensions { date scriptName }
      }
      kv: kvOperationsAdaptiveGroups(limit: 1000, filter: { date_geq: $from, date_leq: $to }) {
        sum { requests }
        dimensions { date actionType }
      }
    }
  }
}`

type GraphQLResponse = {
  data?: {
    viewer?: {
      accounts?: {
        workers?: {
          sum?: { requests?: number }
          dimensions?: { date?: string; scriptName?: string }
        }[]
        kv?: { sum?: { requests?: number }; dimensions?: { date?: string; actionType?: string } }[]
      }[]
    }
  }
  errors?: { message?: string }[] | null
}

const KV_METRIC: Record<string, 'kvReads' | 'kvWrites' | 'kvDeletes' | undefined> = {
  read: 'kvReads',
  write: 'kvWrites',
  delete: 'kvDeletes',
}

/** Turns the GraphQL answer into one row per day. Exported for tests. */
export function parseUsage(res: GraphQLResponse): UsageDay[] {
  if (res.errors?.length)
    throw new Error(res.errors.map((e) => e.message).join('; ') || 'GraphQL error')
  const account = res.data?.viewer?.accounts?.[0]
  if (!account) throw new Error('No data for this account. Check CF_ACCOUNT_ID.')
  const days = new Map<string, UsageDay>()
  const day = (date: string) => days.get(date) ?? days.set(date, { date }).get(date)!
  for (const w of account.workers ?? []) {
    const date = w.dimensions?.date
    if (!date || !OUR_WORKERS.includes(w.dimensions?.scriptName ?? '')) continue
    const d = day(date)
    d.workerRequests = (d.workerRequests ?? 0) + (w.sum?.requests ?? 0)
  }
  for (const k of account.kv ?? []) {
    const date = k.dimensions?.date
    const metric = KV_METRIC[(k.dimensions?.actionType ?? '').toLowerCase()]
    if (!date || !metric) continue
    const d = day(date)
    d[metric] = (d[metric] ?? 0) + (k.sum?.requests ?? 0)
  }
  return [...days.values()]
}

export class CloudflareGraphQLUsage implements CloudflareUsage {
  constructor(
    private accountId: string,
    private token: string,
  ) {}

  async daily(from: string, to: string): Promise<UsageDay[]> {
    const res = await fetch(GRAPHQL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: QUERY, variables: { account: this.accountId, from, to } }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) throw new Error(`Cloudflare responded ${res.status}`)
    return parseUsage((await res.json()) as GraphQLResponse)
  }
}

/** Null when CF_ACCOUNT_ID / CF_ANALYTICS_TOKEN aren't set (the same token as scan analytics). */
export function getCloudflareUsage(): CloudflareUsage | null {
  const cf = env.cloudflareAnalytics
  return cf ? new CloudflareGraphQLUsage(cf.accountId, cf.token) : null
}
