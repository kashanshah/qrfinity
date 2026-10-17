import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import type { FileStore } from '@qrfinity/core'
import { AwsClient } from 'aws4fetch'
import { env } from './env'

/** Keys are app-made paths like study/2026/10/<uuid>.jpg: no "..", no leading slash. */
function checkKey(key: string) {
  if (!/^[a-z0-9][a-z0-9/_.-]{0,250}$/i.test(key) || key.includes('..'))
    throw new Error(`Invalid file key: ${key}`)
}

/** An S3 bucket, or an S3-compatible store (R2) when an endpoint is set. Requests are signed. */
export class S3FileStore implements FileStore {
  readonly configured = true
  private client: AwsClient
  private base: string

  constructor(cfg: NonNullable<typeof env.s3>) {
    this.client = new AwsClient({
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
      region: cfg.region,
      service: 's3',
    })
    // Path-style for custom endpoints; virtual-hosted style for AWS.
    this.base = cfg.endpoint
      ? `${cfg.endpoint.replace(/\/$/, '')}/${cfg.bucket}`
      : `https://${cfg.bucket}.s3.${cfg.region}.amazonaws.com`
  }

  private url(key: string) {
    checkKey(key)
    return `${this.base}/${key.split('/').map(encodeURIComponent).join('/')}`
  }

  async put(key: string, body: Uint8Array, contentType: string) {
    const res = await this.client.fetch(this.url(key), {
      method: 'PUT',
      body: new Uint8Array(body),
      headers: { 'Content-Type': contentType },
    })
    if (!res.ok) throw new Error(`File storage refused the upload (${res.status}).`)
  }

  async get(key: string) {
    const res = await this.client.fetch(this.url(key))
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`File storage read failed (${res.status}).`)
    return {
      body: await res.arrayBuffer(),
      contentType: res.headers.get('content-type') ?? 'application/octet-stream',
    }
  }

  async remove(key: string) {
    const res = await this.client.fetch(this.url(key), { method: 'DELETE' })
    if (!res.ok && res.status !== 404)
      throw new Error(`File storage delete failed (${res.status}).`)
  }
}

/** Development and tests: files under apps/web/.data/files, with the type in a sidecar file. */
export class LocalFileStore implements FileStore {
  readonly configured = true
  private root = resolve(process.cwd(), '.data', 'files')

  private path(key: string) {
    checkKey(key)
    return join(this.root, key)
  }

  async put(key: string, body: Uint8Array, contentType: string) {
    const p = this.path(key)
    await mkdir(dirname(p), { recursive: true })
    await writeFile(p, body)
    await writeFile(`${p}.type`, contentType)
  }

  async get(key: string) {
    const p = this.path(key)
    try {
      const body = await readFile(p)
      const contentType = await readFile(`${p}.type`, 'utf8').catch(
        () => 'application/octet-stream',
      )
      return {
        body: body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
        contentType,
      }
    } catch {
      return null
    }
  }

  async remove(key: string) {
    const p = this.path(key)
    await rm(p, { force: true })
    await rm(`${p}.type`, { force: true })
  }
}

/** Production without a bucket: uploads are refused with a clear message. */
export class UnconfiguredFileStore implements FileStore {
  readonly configured = false
  async put(): Promise<void> {
    throw new Error('File storage isn’t set up (S3_BUCKET and keys).')
  }
  async get() {
    return null
  }
  async remove() {}
}

let store: FileStore | undefined

export function getFileStore(): FileStore {
  if (store) return store
  const s3 = env.s3
  store = s3
    ? new S3FileStore(s3)
    : process.env.NODE_ENV === 'production' && process.env.VERCEL
      ? new UnconfiguredFileStore()
      : new LocalFileStore()
  return store
}
