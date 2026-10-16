import { codes, edgeSyncOutbox, eq, sql, type Database } from '@qrfinity/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  CODE_CSV_COLUMNS,
  ServiceError,
  createDynamicCode,
  createFolder,
  deleteCode,
  deleteFolder,
  destinationHistoryFor,
  duplicateCode,
  exportAll,
  getCode,
  listCodes,
  listTags,
  processOutbox,
  setCodeTags,
  setPaused,
  toCsv,
  updateDestination,
  updateDetails,
} from '@/lib/server/codes'
import { FakeEdge, ctxFor, design, freshDb, makeUser } from './helpers'

let db: Database
beforeAll(async () => {
  db = await freshDb()
})
afterAll(() => db.$client.end())
beforeEach(async () => {
  await db.execute(
    sql`truncate codes, folders, tags, rate_limits, edge_sync_outbox, "user" cascade`,
  )
  await makeUser(db, 'alice')
  await makeUser(db, 'bob')
})

const create = (ctx: ReturnType<typeof ctxFor>, destination = 'example.com/menu', name = 'Menu') =>
  createDynamicCode(ctx, { name, destination, design })

describe('creating dynamic codes', () => {
  it('allocates a slug, records history and pushes v1 to the edge', async () => {
    const ctx = ctxFor(db, 'alice')
    const code = await create(ctx)
    expect(code.slug).toMatch(/^[0-9A-Za-z]{7}$/)
    expect(code.destination).toBe('https://example.com/menu')
    expect(ctx.edge.last()).toMatchObject({
      op: 'put',
      slug: code.slug,
      record: { id: code.id, owner: 'alice', status: 'active', v: 1 },
    })
    expect(await db.select().from(edgeSyncOutbox)).toEqual([])
    expect((await destinationHistoryFor(ctx, code.id)).map((h) => h.newDestination)).toEqual([
      'https://example.com/menu',
    ])
  })

  it('rejects bad destinations and names with plain messages', async () => {
    const ctx = ctxFor(db, 'alice')
    await expect(create(ctx, 'javascript:alert(1)')).rejects.toThrow('full web address')
    await expect(create(ctx, 'https://qrfinity.link/abc1234')).rejects.toThrow(
      'another QRfinity short link',
    )
    await expect(create(ctx, 'example.com', '   ')).rejects.toThrow('Give the code a name')
  })

  it('applies the hourly creation limit', async () => {
    const ctx = ctxFor(db, 'alice', new FakeEdge(), {
      hit: async () => ({ ok: false, retryAfterSeconds: 120 }),
    })
    await expect(create(ctx)).rejects.toMatchObject({
      code: 'rate_limited',
      message: expect.stringContaining('2 minutes'),
    })
  })
})

describe('editing', () => {
  it('changing the destination bumps the version, logs history and updates the edge', async () => {
    const ctx = ctxFor(db, 'alice')
    const code = await create(ctx)
    const updated = await updateDestination(ctx, code.id, {
      destination: 'https://example.com/new-menu',
    })
    expect(updated.version).toBe(2)
    expect(ctx.edge.last()).toMatchObject({
      record: { dest: 'https://example.com/new-menu', v: 2 },
    })
    expect(
      (await destinationHistoryFor(ctx, code.id)).map((h) => [h.oldDestination, h.newDestination]),
    ).toEqual([
      ['https://example.com/menu', 'https://example.com/new-menu'],
      [null, 'https://example.com/menu'],
    ])
  })

  it('renaming and redesigning do not touch the edge', async () => {
    const ctx = ctxFor(db, 'alice')
    const code = await create(ctx)
    const before = ctx.edge.calls.length
    await updateDetails(ctx, code.id, {
      name: 'Lunch menu',
      design: { ...design, dotStyle: 'dots' },
    })
    const c = await getCode(ctx, code.id)
    expect(c.name).toBe('Lunch menu')
    expect(c.design.dotStyle).toBe('dots')
    expect(ctx.edge.calls.length).toBe(before)
  })

  it('pause and resume are pushed to the edge', async () => {
    const ctx = ctxFor(db, 'alice')
    const code = await create(ctx)
    await setPaused(ctx, code.id, true)
    expect(ctx.edge.last()).toMatchObject({ record: { status: 'paused', v: 2 } })
    await setPaused(ctx, code.id, false)
    expect(ctx.edge.last()).toMatchObject({ record: { status: 'active', v: 3 } })
  })

  it('an admin-disabled code cannot be edited or resumed by its owner', async () => {
    const ctx = ctxFor(db, 'alice')
    const code = await create(ctx)
    await db.update(codes).set({ status: 'disabled' }).where(eq(codes.id, code.id))
    await expect(setPaused(ctx, code.id, false)).rejects.toMatchObject({ code: 'forbidden' })
    await expect(
      updateDestination(ctx, code.id, { destination: 'example.org' }),
    ).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('other users cannot see or change a code', async () => {
    const code = await create(ctxFor(db, 'alice'))
    const bob = ctxFor(db, 'bob')
    await expect(getCode(bob, code.id)).rejects.toBeInstanceOf(ServiceError)
    await expect(
      updateDestination(bob, code.id, { destination: 'evil.example' }),
    ).rejects.toMatchObject({ code: 'not_found' })
    await expect(deleteCode(bob, code.id)).rejects.toMatchObject({ code: 'not_found' })
    expect(await listCodes(bob)).toEqual([])
  })
})

describe('edge outbox', () => {
  it('keeps failed pushes queued and retries them', async () => {
    const edge = new FakeEdge()
    edge.failing = true
    const ctx = ctxFor(db, 'alice', edge)
    const code = await create(ctx)
    const [queued] = await db.select().from(edgeSyncOutbox)
    expect(queued).toMatchObject({ codeId: code.id, version: 1, attempts: 1 })

    edge.failing = false
    await db.update(edgeSyncOutbox).set({ createdAt: sql`now() - interval '1 minute'` })
    expect(await processOutbox(db, edge)).toEqual({ attempted: 1, synced: 1 })
    expect(edge.last()).toMatchObject({ op: 'put', record: { v: 1 } })
    expect(await db.select().from(edgeSyncOutbox)).toEqual([])
  })

  it('a slow push of an old version does not clear a newer queued change', async () => {
    const edge = new FakeEdge()
    const ctx = ctxFor(db, 'alice', edge)
    const code = await create(ctx)
    // Simulate a newer change queued (v5) while the row in codes still says v1.
    await db.insert(edgeSyncOutbox).values({ codeId: code.id, version: 5 })
    await processOutbox(db, edge).catch(() => undefined)
    await db.update(edgeSyncOutbox).set({ createdAt: sql`now() - interval '1 minute'` })
    await processOutbox(db, edge)
    expect((await db.select().from(edgeSyncOutbox)).map((r) => r.version)).toEqual([5])
  })
})

describe('deleting and duplicating', () => {
  it('delete removes it from the edge and the list, and the slug is never reused', async () => {
    const ctx = ctxFor(db, 'alice')
    const code = await create(ctx)
    await deleteCode(ctx, code.id)
    expect(ctx.edge.last()).toEqual({ op: 'remove', slug: code.slug })
    expect(await listCodes(ctx)).toEqual([])
    await expect(
      db.insert(codes).values({
        userId: 'bob',
        kind: 'dynamic',
        name: 'x',
        domain: 'qrfinity.link',
        slug: code.slug,
        design,
      }),
    ).rejects.toThrow()
  })

  it('duplicate gets a new slug and keeps tags', async () => {
    const ctx = ctxFor(db, 'alice')
    const code = await create(ctx)
    await setCodeTags(ctx, code.id, ['Print', 'menu'])
    const copy = await duplicateCode(ctx, code.id)
    expect(copy.slug).not.toBe(code.slug)
    expect(copy.name).toBe('Copy of Menu')
    expect(copy.tags).toEqual(['menu', 'print'])
  })
})

describe('organising and searching', () => {
  it('filters by folder, tag and text', async () => {
    const ctx = ctxFor(db, 'alice')
    const menu = await create(ctx, 'example.com/menu', 'Café menu')
    const wifi = await create(ctx, 'wifi.example.com', 'Guest Wi-Fi page')
    const folder = await createFolder(ctx, 'Café')
    await updateDetails(ctx, menu.id, { folderId: folder.id })
    await setCodeTags(ctx, wifi.id, ['lobby'])
    expect((await listCodes(ctx, { folderId: folder.id })).map((c) => c.name)).toEqual([
      'Café menu',
    ])
    expect((await listCodes(ctx, { tag: 'lobby' })).map((c) => c.name)).toEqual([
      'Guest Wi-Fi page',
    ])
    expect((await listCodes(ctx, { q: 'WIFI' })).map((c) => c.name)).toEqual(['Guest Wi-Fi page'])
    expect((await listCodes(ctx, { q: '100%_' })).length).toBe(0)
    await expect(createFolder(ctx, 'Café')).rejects.toThrow('already have a folder')
    await deleteFolder(ctx, folder.id)
    expect((await getCode(ctx, menu.id)).folderId).toBeNull()
  })

  it('cleans up unused tags', async () => {
    const ctx = ctxFor(db, 'alice')
    const code = await create(ctx)
    await setCodeTags(ctx, code.id, ['a', 'b'])
    await setCodeTags(ctx, code.id, ['b'])
    expect((await listTags(ctx)).map((t) => t.name)).toEqual(['b'])
  })
})

describe('export', () => {
  it('exports every code with history, and CSV neutralises formulas', async () => {
    const ctx = ctxFor(db, 'alice')
    const code = await create(ctx, 'example.com', '=HYPERLINK("x")')
    await updateDestination(ctx, code.id, { destination: 'example.org' })
    const data = await exportAll(ctx)
    expect(data).toHaveLength(1)
    expect(data[0]!.short_link).toBe(`https://qrfinity.link/${code.slug}`)
    expect(data[0]!.destination_history).toHaveLength(2)
    const csv = toCsv(data, CODE_CSV_COLUMNS)
    expect(csv.split('\r\n')[0]).toBe(CODE_CSV_COLUMNS.map((c) => `"${c}"`).join(','))
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`)
  })
})

describe('untrusted input from the browser', () => {
  it('sanitises designs and content before storing them', async () => {
    const ctx = ctxFor(db, 'alice')
    const code = await createDynamicCode(ctx, {
      name: 'x',
      destination: 'example.com',
      design: { ...design, background: 'url(javascript:1)', quietZone: 500 } as never,
      content: { type: 'url', fields: { url: 'example.com', injected: '<script>' } } as never,
    })
    expect(code.design.background).toBe('#ffffff')
    expect(code.design.quietZone).toBe(10)
    expect(code.content).toEqual({ type: 'url', fields: { url: 'example.com' } })
    const other = await createDynamicCode(ctx, {
      name: 'y',
      destination: 'example.com',
      design,
      content: { type: 'evil', fields: {} } as never,
    })
    expect(other.content).toBeNull()
  })
})
