import { signedHeaders, type EdgeSync, type LinkRecord } from '@qrfinity/core'
import { env } from './env'

/** Pushes link records to KV through the private edge-api Worker. */
export class HttpEdgeSync implements EdgeSync {
  constructor(
    private baseUrl: string,
    private secret: string,
  ) {}

  private async send(method: 'PUT' | 'DELETE', domain: string, slug: string, body = '') {
    const path = `/v1/links/${encodeURIComponent(domain)}/${encodeURIComponent(slug)}`
    const res = await fetch(this.baseUrl.replace(/\/$/, '') + path, {
      method,
      body: method === 'PUT' ? body : undefined,
      headers: {
        'Content-Type': 'application/json',
        ...(await signedHeaders(this.secret, method, path, body)),
      },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) throw new Error(`edge-api responded ${res.status}`)
  }

  put(domain: string, slug: string, record: LinkRecord) {
    return this.send('PUT', domain, slug, JSON.stringify(record))
  }
  remove(domain: string, slug: string) {
    return this.send('DELETE', domain, slug)
  }
}

/** Used when no edge-api is configured: changes stay queued in the outbox. */
export class UnconfiguredEdgeSync implements EdgeSync {
  async put() {
    throw new Error('EDGE_API_URL and EDGE_API_SECRET are not set')
  }
  async remove() {
    throw new Error('EDGE_API_URL and EDGE_API_SECRET are not set')
  }
}

export function getEdgeSync(): EdgeSync {
  const cfg = env.edgeApi
  return cfg ? new HttpEdgeSync(cfg.url, cfg.secret) : new UnconfiguredEdgeSync()
}
