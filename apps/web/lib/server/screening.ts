import { screenDestination, type BlocklistEntry, type UrlReputation } from '@qrfinity/core'
import { blocklist, type Database } from '@qrfinity/db'
import { ServiceError } from './errors'

const CACHE_MS = 60_000
const g = globalThis as unknown as {
  __qrfinityBlocklist?: { at: number; entries: BlocklistEntry[] }
}

export async function loadBlocklist(db: Database): Promise<BlocklistEntry[]> {
  const cached = g.__qrfinityBlocklist
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.entries
  const entries = await db
    .select({ kind: blocklist.kind, value: blocklist.value, reason: blocklist.reason })
    .from(blocklist)
  g.__qrfinityBlocklist = { at: Date.now(), entries }
  return entries
}

export function invalidateBlocklist() {
  g.__qrfinityBlocklist = undefined
}

const DAY = 86_400_000
/** Re-check schedule: a day after creation, then a week, then monthly. */
export function nextRiskCheck(checksDone: number, from = new Date()): Date {
  const days = checksDone <= 1 ? 1 : checksDone === 2 ? 7 : 30
  return new Date(from.getTime() + days * DAY)
}

export type RiskFields = {
  riskStatus: 'clean' | 'unchecked'
  riskDetail: string | null
  riskCheckedAt: Date | null
  riskChecks: number
  nextRiskCheckAt: Date
}

/**
 * Screens a destination before a code is created or changed: shorteners, the blocklist,
 * then Google Web Risk. A hit refuses the change. If Web Risk can't be reached the change
 * goes through and the code is re-checked within the hour.
 */
export async function screenForCode(
  db: Database,
  reputation: UrlReputation,
  url: string,
): Promise<RiskFields> {
  const hit = screenDestination(url, await loadBlocklist(db))
  if (hit) throw new ServiceError(hit.message, 'invalid')
  const r = await reputation.check(url)
  if (r.status === 'threat') {
    throw new ServiceError(
      'Google flags this address as unsafe (phishing or malware), so we can’t point a code to it.',
      'invalid',
    )
  }
  const now = new Date()
  if (r.status === 'clean')
    return {
      riskStatus: 'clean',
      riskDetail: null,
      riskCheckedAt: now,
      riskChecks: 1,
      nextRiskCheckAt: nextRiskCheck(1, now),
    }
  return {
    riskStatus: 'unchecked',
    riskDetail: r.reason.slice(0, 200),
    riskCheckedAt: null,
    riskChecks: 0,
    nextRiskCheckAt: new Date(now.getTime() + 3_600_000),
  }
}
