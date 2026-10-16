import type { CloudflareUsage, Email, UsageDay } from '@qrfinity/core'
import { sql, type Database } from '@qrfinity/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { checkUsageAlert } from '@/lib/server/usage-alert'
import { freshDb } from './helpers'

let db: Database
beforeAll(async () => {
  db = await freshDb()
})
afterAll(() => db.$client.end())
beforeEach(async () => {
  await db.execute(sql`truncate app_settings`)
})

const now = new Date('2026-10-16T15:00:00Z')
const usage = (day: Partial<UsageDay>): CloudflareUsage => ({
  daily: async () => [{ date: '2026-10-16', ...day }],
})
const run = (cf: CloudflareUsage | null, sent: Email[], adminEmails = ['kashan@example.com']) =>
  checkUsageAlert({
    db,
    cf,
    mailer: { send: async (e) => void sent.push(e) },
    adminEmails,
    siteUrl: 'https://qrfinity.com',
    now,
  })

describe('Cloudflare usage alert', () => {
  it('stays quiet under 50%', async () => {
    const sent: Email[] = []
    expect(await run(usage({ workerRequests: 49_000 }), sent)).toMatchObject({ sent: 0 })
    expect(sent).toHaveLength(0)
  })

  it('emails once at 50%, again at 80%, then not again that day', async () => {
    const sent: Email[] = []
    await run(usage({ workerRequests: 52_000, kvReads: 10_000 }), sent)
    expect(sent).toHaveLength(1)
    expect(sent[0]!.subject).toBe('QRfinity: Cloudflare usage at 52% of today’s free limit')
    expect(sent[0]!.text).toContain('Worker requests (scans and syncs): 52,000 of 100,000 (52%)')
    expect(sent[0]!.text).not.toContain('KV reads')

    await run(usage({ workerRequests: 60_000 }), sent)
    expect(sent).toHaveLength(1)
    await run(usage({ workerRequests: 85_000 }), sent)
    expect(sent).toHaveLength(2)
    expect(sent[1]!.subject).toContain('85%')
    await run(usage({ workerRequests: 99_000 }), sent)
    expect(sent).toHaveLength(2)
  })

  it('watches every limit, e.g. KV writes', async () => {
    const sent: Email[] = []
    await run(usage({ workerRequests: 1_000, kvWrites: 900 }), sent)
    expect(sent[0]!.subject).toContain('90%')
  })

  it('does nothing on the paid plan, without Cloudflare access or admins', async () => {
    const sent: Email[] = []
    await db.execute(
      sql`insert into app_settings (key, value) values ('cloudflare_plan', '"paid"'::jsonb)`,
    )
    expect(await run(usage({ workerRequests: 99_000 }), sent)).toMatchObject({
      reason: 'paid plan',
    })
    await db.execute(sql`truncate app_settings`)
    expect(await run(null, sent)).toMatchObject({ reason: 'no Cloudflare credentials' })
    expect(await run(usage({ workerRequests: 99_000 }), sent, [])).toMatchObject({
      reason: 'no ADMIN_EMAILS',
    })
    expect(sent).toHaveLength(0)
  })
})
