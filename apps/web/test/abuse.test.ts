import type { Email, Mailer } from '@qrfinity/core'
import {
  auditLog,
  blocklist,
  codes,
  eq,
  reports,
  session,
  sql,
  user,
  type Database,
} from '@qrfinity/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { deleteAccount } from '@/lib/server/account'
import {
  addBlock,
  listAudit,
  listBlocklist,
  listFlaggedCodes,
  listReports,
  disableCode,
  isAdmin,
  restoreCode,
  runRiskChecks,
  searchCodes,
  searchUsers,
  suspendUser,
  type AdminContext,
} from '@/lib/server/admin'
import {
  createDynamicCode,
  deleteCode,
  getCode,
  setPaused,
  updateDestination,
} from '@/lib/server/codes'
import { createReport, slugFromReported } from '@/lib/server/reports'
import { invalidateBlocklist } from '@/lib/server/screening'
import { FakeEdge, FakeReputation, ctxFor, design, freshDb, makeUser } from './helpers'
import { PostgresRateLimiter } from '@/lib/server/rate-limit'

class FakeMailer implements Mailer {
  sent: Email[] = []
  async send(e: Email) {
    this.sent.push(e)
  }
}

let db: Database
beforeAll(async () => {
  db = await freshDb()
})
afterAll(() => db.$client.end())
beforeEach(async () => {
  await db.execute(
    sql`truncate codes, folders, tags, rate_limits, edge_sync_outbox, reports, audit_log, "user" cascade`,
  )
  await db.delete(blocklist).where(sql`created_by <> 'system'`)
  invalidateBlocklist()
  await makeUser(db, 'alice')
})

const adminCtx = (
  edge = new FakeEdge(),
  mailer = new FakeMailer(),
): AdminContext & { edge: FakeEdge; mailer: FakeMailer } => ({
  db,
  edge,
  mailer,
  actor: 'admin-1',
  abuseEmail: 'abuse@qrfinity.com',
  siteUrl: 'https://qrfinity.com',
})
const dueNow = (id: string) =>
  db
    .update(codes)
    .set({ nextRiskCheckAt: sql`now() - interval '1 minute'` })
    .where(eq(codes.id, id))

describe('screening on create and edit', () => {
  it('refuses shorteners, blocklisted TLDs and Web Risk threats', async () => {
    const ctx = ctxFor(db, 'alice')
    ctx.reputation.flagged.set('phish', { status: 'threat', threats: ['SOCIAL_ENGINEERING'] })
    await expect(
      createDynamicCode(ctx, { name: 'a', destination: 'bit.ly/abc', design }),
    ).rejects.toThrow('hide where they go')
    await expect(
      createDynamicCode(ctx, { name: 'a', destination: 'invoice.zip', design }),
    ).rejects.toThrow('acceptable use')
    await expect(
      createDynamicCode(ctx, { name: 'a', destination: 'phish.example/login', design }),
    ).rejects.toThrow('unsafe')
    const ok = await createDynamicCode(ctx, { name: 'a', destination: 'example.com', design })
    await expect(updateDestination(ctx, ok.id, { destination: 'phish.example/x' })).rejects.toThrow(
      'unsafe',
    )
  })

  it('marks a clean destination and schedules the next check in a day', async () => {
    const ctx = ctxFor(db, 'alice')
    const c = await createDynamicCode(ctx, { name: 'a', destination: 'example.com', design })
    expect(c.riskStatus).toBe('clean')
    expect(c.nextRiskCheckAt!.getTime() - Date.now()).toBeGreaterThan(23 * 3_600_000)
  })

  it('lets the change through when Web Risk is unreachable, and re-checks within the hour', async () => {
    const ctx = ctxFor(db, 'alice')
    ctx.reputation.down = true
    const c = await createDynamicCode(ctx, { name: 'a', destination: 'example.com', design })
    expect(c.riskStatus).toBe('unchecked')
    expect(c.nextRiskCheckAt!.getTime() - Date.now()).toBeLessThan(3_700_000)
  })

  it('checks the blocklist only after rate limits (spam cannot burn lookups)', async () => {
    const ctx = ctxFor(db, 'alice', new FakeEdge(), {
      hit: async () => ({ ok: false, retryAfterSeconds: 60 }),
    })
    await expect(
      createDynamicCode(ctx, { name: 'a', destination: 'example.com', design }),
    ).rejects.toMatchObject({ code: 'rate_limited' })
    expect(ctx.reputation.calls).toEqual([])
  })
})

describe('admin actions', () => {
  it('disable sends the warning state to the edge, emails the owner, closes reports and audits', async () => {
    const ctx = ctxFor(db, 'alice')
    const c = await createDynamicCode(ctx, { name: 'Menu', destination: 'example.com', design })
    await createReport(db, new PostgresRateLimiter(db), 's', {
      reported: `https://qrfinity.link/${c.slug}`,
      reason: 'phishing',
      visitor: 'v',
      shortDomain: 'qrfinity.link',
    })
    const admin = adminCtx()
    await disableCode(admin, c.id, 'Phishing page')
    expect(admin.edge.last()).toMatchObject({ op: 'put', record: { status: 'disabled' } })
    expect(admin.mailer.sent[0]).toMatchObject({
      to: 'alice@example.com',
      subject: expect.stringContaining('Menu'),
    })
    expect((await db.select().from(reports))[0]).toMatchObject({
      status: 'actioned',
      resolvedBy: 'admin-1',
    })
    expect((await db.select().from(auditLog)).map((a) => a.action)).toContain('code.disable')
    // The owner can neither resume nor edit it.
    await expect(setPaused(ctx, c.id, false)).rejects.toMatchObject({ code: 'forbidden' })
    await restoreCode(admin, c.id)
    expect(admin.edge.last()).toMatchObject({ record: { status: 'active' } })
    expect((await getCode(ctx, c.id)).status).toBe('active')
  })

  it('code search lists the newest codes when empty and filters when not', async () => {
    await makeUser(db, 'bob')
    const menu = await createDynamicCode(ctxFor(db, 'alice'), {
      name: 'Menu',
      destination: 'example.com/menu',
      design,
    })
    const flyer = await createDynamicCode(ctxFor(db, 'bob'), {
      name: 'Flyer',
      destination: 'example.org/flyer',
      design,
    })
    await db
      .update(codes)
      .set({ createdAt: sql`now() + interval '1 minute'` })
      .where(eq(codes.id, flyer.id))
    expect((await searchCodes(db, '')).rows.map((r) => r.code.id)).toEqual([flyer.id, menu.id])
    expect((await searchCodes(db, '  ')).rows.length).toBe(2)
    expect((await searchCodes(db, 'menu')).rows.map((r) => r.code.id)).toEqual([menu.id])
    expect((await searchCodes(db, 'bob@')).rows.map((r) => r.code.id)).toEqual([flyer.id])
    expect((await searchCodes(db, `https://qrfinity.link/${menu.slug}`)).rows[0]?.code.id).toBe(
      menu.id,
    )
    await db.update(codes).set({ deletedAt: new Date() }).where(eq(codes.id, menu.id))
    expect((await searchCodes(db, '')).rows.map((r) => r.code.id)).toEqual([flyer.id])
  })

  it('suspending a user signs them out everywhere', async () => {
    await db
      .insert(session)
      .values({ id: 's1', token: 't1', userId: 'alice', expiresAt: new Date(Date.now() + 1e9) })
    await suspendUser(adminCtx(), 'alice', 'spam')
    expect(await db.select().from(session)).toEqual([])
    expect(
      (await db.select().from(user).where(eq(user.id, 'alice')))[0]!.suspendedAt,
    ).not.toBeNull()
  })

  it('recognises admins by role or by configured email', () => {
    expect(isAdmin({ email: 'a@x.com', role: 'admin' }, [])).toBe(true)
    expect(isAdmin({ email: 'Boss@X.com', role: 'user' }, ['boss@x.com'])).toBe(true)
    expect(isAdmin({ email: 'a@x.com', role: 'user' }, ['boss@x.com'])).toBe(false)
  })
})

describe('admin search', () => {
  it('lists users with their plan and live code count, and finds codes', async () => {
    const ctx = ctxFor(db, 'alice')
    await createDynamicCode(ctx, { name: 'Menu', destination: 'example.com', design })
    const gone = await createDynamicCode(ctx, {
      name: 'Old',
      destination: 'example.com/old',
      design,
    })
    await deleteCode(ctx, gone.id)
    await makeUser(db, 'bob')
    const { rows: all } = await searchUsers(db, '')
    expect(all.find((u) => u.id === 'alice')).toMatchObject({
      email: 'alice@example.com',
      plan: 'free',
      codes: 1,
    })
    expect(all.find((u) => u.id === 'bob')).toMatchObject({ codes: 0 })
    expect((await searchUsers(db, 'ALICE')).rows.map((u) => u.id)).toEqual(['alice'])
    expect((await searchCodes(db, 'alice@example.com')).rows.length).toBeGreaterThanOrEqual(1)
  })

  it('admin lists sort by the requested column and ignore unknown ones', async () => {
    await makeUser(db, 'bob')
    const ctx = ctxFor(db, 'alice')
    await createDynamicCode(ctx, { name: 'Beta', destination: 'example.com/b', design })
    await createDynamicCode(ctx, { name: 'alpha', destination: 'example.com/a', design })
    await createDynamicCode(ctxFor(db, 'bob'), {
      name: 'Gamma',
      destination: 'example.org',
      design,
    })
    const names = async (sort?: string, dir?: string) =>
      (await searchCodes(db, '', { sort, dir })).rows.map((r) => r.code.name)
    expect(await names('name', 'asc')).toEqual(['alpha', 'Beta', 'Gamma'])
    expect(await names('name', 'desc')).toEqual(['Gamma', 'Beta', 'alpha'])
    // Owner sort groups alice's codes before bob's.
    expect((await names('owner', 'asc')).at(-1)).toBe('Gamma')
    // Unknown keys and directions fall back to the default (newest first), never to raw SQL.
    const fallback = await searchCodes(db, '', { sort: 'name; drop table codes', dir: 'sideways' })
    expect(fallback).toMatchObject({ sort: 'created', dir: 'desc' })

    const users = await searchUsers(db, '', { sort: 'email', dir: 'asc' })
    expect(users.rows.map((u) => u.email)).toEqual(['alice@example.com', 'bob@example.com'])
    expect((await searchUsers(db, '', { sort: 'codes', dir: 'desc' })).rows[0]?.id).toBe('alice')

    await addBlock(adminCtx(), 'domain', 'zzz-bad.example', 'Kit seen in report 4417')
    await addBlock(adminCtx(), 'domain', 'aaa-bad.example', 'Malware')
    const blocks = await listBlocklist(db, 'bad.example', { sort: 'value', dir: 'desc' })
    expect(blocks.rows.map((b) => b.value)).toEqual(['zzz-bad.example', 'aaa-bad.example'])
    expect((await listBlocklist(db, 'report 4417')).rows.map((b) => b.value)).toEqual([
      'zzz-bad.example',
    ])

    const audit = await listAudit(db, 'zzz-bad', { perPage: 10 })
    expect(audit.total).toBe(1)
    expect(audit.rows[0]).toMatchObject({ action: 'blocklist.add' })

    expect(await listReports(db, 'open', 'nothing-like-this')).toMatchObject({ total: 0, rows: [] })
    expect(await listFlaggedCodes(db)).toMatchObject({ total: 0, sort: 'checked', dir: 'desc' })
  })

  it('user search pages through results, newest first, and clamps bad input', async () => {
    // alice exists already; add 11 more, each a minute newer than the last.
    for (let i = 1; i <= 11; i++) {
      const id = `user${String(i).padStart(2, '0')}`
      await makeUser(db, id)
      await db
        .update(user)
        .set({ createdAt: sql`now() + make_interval(mins => ${i})` })
        .where(eq(user.id, id))
    }
    const first = await searchUsers(db, '', { page: 1, perPage: 10 })
    expect(first).toMatchObject({ total: 12, page: 1, pages: 2, perPage: 10 })
    expect(first.rows.map((u) => u.id).slice(0, 2)).toEqual(['user11', 'user10'])
    const second = await searchUsers(db, '', { page: 2, perPage: 10 })
    expect(second.rows.map((u) => u.id)).toEqual(['user01', 'alice'])
    // Past the end clamps to the last page; an unknown size falls back to the default.
    expect((await searchUsers(db, '', { page: 99, perPage: 10 })).page).toBe(2)
    expect((await searchUsers(db, '', { perPage: 7 })).perPage).toBe(25)
    // Search covers names too, and counts only the matches.
    await db.update(user).set({ name: 'Zed Example' }).where(eq(user.id, 'user05'))
    expect(await searchUsers(db, 'zed', { perPage: 10 })).toMatchObject({
      total: 1,
      pages: 1,
      rows: [{ id: 'user05' }],
    })
  })
})

describe('scheduled re-check', () => {
  it('turns off high-confidence threats, flags the rest, and keeps clean codes live', async () => {
    const ctx = ctxFor(db, 'alice')
    const good = await createDynamicCode(ctx, { name: 'good', destination: 'good.example', design })
    const bad = await createDynamicCode(ctx, {
      name: 'bad',
      destination: 'turned-bad.example',
      design,
    })
    const meh = await createDynamicCode(ctx, { name: 'meh', destination: 'pua.example', design })
    for (const c of [good, bad, meh]) await dueNow(c.id)
    const rep = new FakeReputation()
    rep.flagged.set('turned-bad', { status: 'threat', threats: ['MALWARE'] })
    rep.flagged.set('pua', { status: 'threat', threats: ['UNWANTED_SOFTWARE'] })
    const admin = adminCtx()
    const summary = await runRiskChecks(admin, rep, 100)
    expect(summary).toMatchObject({ lookups: 3, disabled: 1, flagged: 1 })
    expect((await getCode(ctx, bad.id)).status).toBe('disabled')
    expect(await getCode(ctx, meh.id)).toMatchObject({ status: 'active', riskStatus: 'flagged' })
    expect(await getCode(ctx, good.id)).toMatchObject({
      status: 'active',
      riskStatus: 'clean',
      riskChecks: 2,
    })
    expect(admin.mailer.sent).toHaveLength(1)
    expect((await db.select().from(auditLog)).find((a) => a.action === 'code.disable')?.actor).toBe(
      'system',
    )
  })

  it('flags codes whose domain was blocklisted later, without a lookup', async () => {
    const ctx = ctxFor(db, 'alice')
    const c = await createDynamicCode(ctx, {
      name: 'x',
      destination: 'later-bad.example/p',
      design,
    })
    await addBlock(adminCtx(), 'domain', 'later-bad.example', 'reported scam')
    await dueNow(c.id)
    const rep = new FakeReputation()
    await runRiskChecks(adminCtx(), rep, 10)
    expect(rep.calls).toEqual([])
    expect(await getCode(ctx, c.id)).toMatchObject({ status: 'active', riskStatus: 'flagged' })
  })

  it('respects the lookup budget and looks each destination up once', async () => {
    const ctx = ctxFor(db, 'alice')
    for (let i = 0; i < 3; i++)
      await dueNow(
        (await createDynamicCode(ctx, { name: `s${i}`, destination: 'same.example', design })).id,
      )
    for (let i = 0; i < 3; i++)
      await dueNow(
        (await createDynamicCode(ctx, { name: `d${i}`, destination: `d${i}.example`, design })).id,
      )
    const rep = new FakeReputation()
    const s = await runRiskChecks(adminCtx(), rep, 2)
    expect(s.lookups).toBe(2)
    expect(new Set(rep.calls).size).toBe(rep.calls.length)
  })

  it('defers when Web Risk is not configured', async () => {
    const ctx = ctxFor(db, 'alice')
    const c = await createDynamicCode(ctx, { name: 'x', destination: 'example.com', design })
    await dueNow(c.id)
    const rep = new FakeReputation()
    rep.down = true
    rep.configured = false
    expect((await runRiskChecks(adminCtx(), rep, 10)).deferred).toBe(1)
    expect((await getCode(ctx, c.id)).nextRiskCheckAt!.getTime()).toBeGreaterThan(
      Date.now() + 5 * 3_600_000,
    )
  })
})

describe('reports', () => {
  it('finds the code from a full link, a bare domain path or the slug', async () => {
    expect(slugFromReported('https://qrfinity.link/aB3xK9q?x=1')).toBe('aB3xK9q')
    expect(slugFromReported('qrfinity.link/aB3xK9q/')).toBe('aB3xK9q')
    expect(slugFromReported('aB3xK9q')).toBe('aB3xK9q')
    expect(slugFromReported('a scam site')).toBeNull()
  })
  it('validates input and rate-limits per visitor', async () => {
    const limiter = new PostgresRateLimiter(db)
    const base = {
      reported: 'qrfinity.link/zzzzzz9',
      reason: 'scam',
      visitor: 'v9',
      shortDomain: 'qrfinity.link',
    }
    await expect(createReport(db, limiter, 's', { ...base, reason: 'nope' })).rejects.toThrow(
      'Choose a reason',
    )
    await expect(createReport(db, limiter, 's', { ...base, email: 'bad' })).rejects.toThrow('email')
    for (let i = 0; i < 10; i++) await createReport(db, limiter, 's', base)
    await expect(createReport(db, limiter, 's', base)).rejects.toMatchObject({
      code: 'rate_limited',
    })
  })
})

describe('account deletion', () => {
  it('removes personal data, takes codes off the edge and keeps their slugs reserved', async () => {
    const ctx = ctxFor(db, 'alice')
    const c = await createDynamicCode(ctx, { name: 'Menu', destination: 'example.com', design })
    await deleteAccount(ctx)
    expect(ctx.edge.last()).toEqual({ op: 'remove', slug: c.slug })
    const [u] = await db.select().from(user).where(eq(user.id, 'alice'))
    expect(u!.email).toBe('deleted-alice@deleted.invalid')
    const [row] = await db.select().from(codes).where(eq(codes.id, c.id))
    expect(row!.deletedAt).not.toBeNull()
    expect(row!.slug).toBe(c.slug)
  })
})
