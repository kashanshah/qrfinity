import {
  ALL_THREATS,
  type ReputationResult,
  type ThreatType,
  type UrlReputation,
} from '@qrfinity/core'
import { env } from './env'

/**
 * Google Web Risk Lookup API (the commercial counterpart of Safe Browsing).
 * Free up to 100,000 lookups a month, then billed per 1,000; see docs/decisions.md.
 */
export class WebRiskReputation implements UrlReputation {
  readonly configured = true
  constructor(private apiKey: string) {}

  async check(url: string): Promise<ReputationResult> {
    const q = new URLSearchParams({ uri: url, key: this.apiKey })
    for (const t of ALL_THREATS) q.append('threatTypes', t)
    try {
      const res = await fetch(`https://webrisk.googleapis.com/v1/uris:search?${q}`, {
        signal: AbortSignal.timeout(4000),
      })
      if (!res.ok) return { status: 'unknown', reason: `Web Risk responded ${res.status}` }
      const data = (await res.json()) as { threat?: { threatTypes?: string[] } }
      const threats = (data.threat?.threatTypes ?? []).filter((t): t is ThreatType =>
        (ALL_THREATS as readonly string[]).includes(t),
      )
      return threats.length ? { status: 'threat', threats } : { status: 'clean' }
    } catch (error) {
      return { status: 'unknown', reason: String(error) }
    }
  }
}

/** No API key: every check is "unknown", so codes stay queued for re-checking once a key is set. */
export class UnconfiguredReputation implements UrlReputation {
  readonly configured = false
  async check(): Promise<ReputationResult> {
    return { status: 'unknown', reason: 'WEB_RISK_API_KEY is not set' }
  }
}

export function getReputation(): UrlReputation {
  const key = env.webRiskApiKey
  return key ? new WebRiskReputation(key) : new UnconfiguredReputation()
}
