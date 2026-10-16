import { DEFAULT_FIELDS, type VcardFields } from '@qrfinity/core'
import { codes, destinationHistory, eq, sql, type Database } from '@qrfinity/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { runRiskChecks, type AdminContext } from '@/lib/server/admin'
import { setUserPlan } from '@/lib/server/entitlements'
import {
  createDynamicCode,
  duplicateCode,
  setPageStyle,
  setRules,
  updateDestination,
  updateDetails,
} from '@/lib/server/codes'
import { FakeEdge, FakeReputation, ctxFor, design, freshDb, makeUser } from './helpers'

let db: Database
let edge: FakeEdge
let rep: FakeReputation
beforeAll(async () => {
  db = await freshDb()
})
afterAll(() => db.$client.end())
beforeEach(async () => {
  await db.execute(sql`truncate codes, rate_limits, edge_sync_outbox, audit_log, "user" cascade`)
  edge = new FakeEdge()
  rep = new FakeReputation()
  await makeUser(db, 'alice')
})

const ctx = () => ctxFor(db, 'alice', edge, undefined, rep)
const card = (patch: Partial<VcardFields> = {}) => ({
  type: 'vcard' as const,
  fields: { ...DEFAULT_FIELDS.vcard, firstName: 'Jane', lastName: 'Doe', ...patch },
})
const makeCard = (patch?: Partial<VcardFields>) =>
  createDynamicCode(ctx(), { name: 'Jane', content: card(patch), design })
const lastPut = () => edge.calls.filter((c) => c.op === 'put').at(-1)?.record
const admin = (): AdminContext => ({
  db,
  edge,
  mailer: { send: async () => {} },
  actor: 'admin',
  abuseEmail: 'abuse@example.com',
  siteUrl: 'https://qrfinity.com',
})

describe('dynamic contact cards', () => {
  it('creates a code with no destination that serves a contact page', async () => {
    const c = await makeCard({ website: 'acme.example' })
    expect(c.destination).toBeNull()
    expect(c.content).toEqual(card({ website: 'acme.example' }))
    expect(lastPut()).toMatchObject({ dest: '', page: card({ website: 'acme.example' }) })
    // The website is screened like a destination.
    expect(rep.calls).toEqual(['https://acme.example'])
    const [view] = await db.execute<{ page: unknown }>(
      sql`select page from redirect_lookup where id = ${c.id}`,
    )
    expect(view?.page).toEqual(card({ website: 'acme.example' }))
    const [h] = await db
      .select()
      .from(destinationHistory)
      .where(eq(destinationHistory.codeId, c.id))
    expect(h?.newDestination).toBe('Contact card: Jane Doe')
  })

  it('refuses empty cards and unsafe websites', async () => {
    await expect(
      createDynamicCode(ctx(), {
        name: 'x',
        content: card({ firstName: '', lastName: '' }),
        design,
      }),
    ).rejects.toThrow('Add a name or an organisation')
    rep.flagged.set('evil.example', { status: 'threat', threats: ['SOCIAL_ENGINEERING'] })
    await expect(makeCard({ website: 'evil.example/login' })).rejects.toThrow('unsafe')
    await expect(makeCard({ website: 'qrfinity.link/abc' })).rejects.toThrow()
  })

  it('edits the card, and switches between a card and a link', async () => {
    const c = await makeCard()
    const edited = await updateDestination(ctx(), c.id, { content: card({ title: 'Owner' }) })
    expect(edited.version).toBe(c.version + 1)
    expect(lastPut()?.page?.fields.title).toBe('Owner')
    // Saving the same details again changes nothing.
    expect(
      (await updateDestination(ctx(), c.id, { content: card({ title: 'Owner' }) })).version,
    ).toBe(edited.version)

    const link = await updateDestination(ctx(), c.id, {
      destination: 'example.com/menu',
      content: { type: 'url', fields: { url: 'example.com/menu' } },
    })
    expect(link.destination).toBe('https://example.com/menu')
    expect(lastPut()).not.toHaveProperty('page')
    expect(lastPut()?.dest).toBe('https://example.com/menu')

    await updateDestination(ctx(), c.id, { content: card() })
    const history = await db
      .select({ old: destinationHistory.oldDestination, now: destinationHistory.newDestination })
      .from(destinationHistory)
      .where(eq(destinationHistory.codeId, c.id))
    expect(history.map((h) => h.now)).toEqual([
      'Contact card: Jane Doe',
      'Contact card: Jane Doe',
      'https://example.com/menu',
      'Contact card: Jane Doe',
    ])
  })

  it('has no redirect rules, and duplicates as a card', async () => {
    const c = await makeCard()
    await expect(
      setRules(ctx(), c.id, [{ when: { type: 'device', devices: ['ios'] }, dest: 'a.example' }]),
    ).rejects.toThrow('A contact card always shows its page')
    const copy = await duplicateCode(ctx(), c.id)
    expect(copy.destination).toBeNull()
    expect(copy.content).toEqual(card())
  })

  it('re-checks the card’s website, and skips cards without one', async () => {
    const withSite = await makeCard({ website: 'acme.example' })
    const without = await makeCard()
    await db.update(codes).set({ nextRiskCheckAt: new Date(0) })
    rep.calls = []
    rep.flagged.set('acme.example', { status: 'threat', threats: ['MALWARE'] })
    const admin: AdminContext = {
      db,
      edge,
      mailer: { send: async () => {} },
      actor: 'system',
      abuseEmail: 'abuse@example.com',
      siteUrl: 'https://qrfinity.com',
    }
    await runRiskChecks(admin, rep, 10)
    expect(rep.calls).toEqual(['https://acme.example'])
    const rows = await db.select().from(codes)
    expect(rows.find((r) => r.id === withSite.id)?.status).toBe('disabled')
    const skipped = rows.find((r) => r.id === without.id)!
    expect(skipped.status).toBe('active')
    expect(skipped.nextRiskCheckAt!.getTime()).toBeGreaterThan(Date.now())
  })

  it('styles the page: template and accent, kept when the details change', async () => {
    const c = await makeCard()
    // No accent chosen and a black code: the brand green.
    expect(lastPut()?.page?.style).toEqual({ template: 'classic', accent: '#0f5132' })
    await setPageStyle(ctx(), c.id, { template: 'centered', accent: '#C2410C' })
    expect(lastPut()?.page?.style).toEqual({ template: 'centered', accent: '#c2410c' })
    await updateDestination(ctx(), c.id, { content: card({ title: 'Owner' }) })
    expect(lastPut()?.page?.style).toEqual({ template: 'centered', accent: '#c2410c' })
    expect(lastPut()?.page?.fields.title).toBe('Owner')
    await expect(setPageStyle(ctx(), c.id, { template: 'neon' })).resolves.toMatchObject({
      content: { style: { template: 'classic', accent: null } },
    })
  })

  it('follows the code’s colour when no accent is chosen', async () => {
    const c = await makeCard()
    const before = edge.calls.length
    await updateDetails(ctx(), c.id, {
      design: { ...design, foreground: { type: 'solid', color: '#1d4ed8' } },
    })
    expect(edge.calls.length).toBe(before + 1)
    expect(lastPut()?.page?.style?.accent).toBe('#1d4ed8')
    // With a chosen accent, a design change doesn't touch the page.
    await setPageStyle(ctx(), c.id, { template: 'classic', accent: '#c2410c' })
    const after = edge.calls.length
    await updateDetails(ctx(), c.id, { design })
    expect(edge.calls.length).toBe(after)
  })

  it('keeps paid templates for paid plans, and shows Classic once a plan ends', async () => {
    const c = await makeCard()
    await expect(setPageStyle(ctx(), c.id, { template: 'banner' })).rejects.toThrow(
      'The Banner template comes with Plus and above.',
    )
    await expect(setPageStyle(ctx(), c.id, { template: 'elegant' })).rejects.toThrow(
      'comes with Unlimited',
    )
    await setUserPlan(admin(), 'alice', 'pro')
    await setPageStyle(ctx(), c.id, { template: 'compact', accent: '#1d4ed8' })
    expect(lastPut()?.page?.style?.template).toBe('compact')
    await expect(setPageStyle(ctx(), c.id, { template: 'spotlight' })).rejects.toThrow(
      'comes with Unlimited',
    )
    // The plan ends: the saved template stays, the page shows Classic, and comes back with a plan.
    await setUserPlan(admin(), 'alice', 'free')
    expect(lastPut()?.page?.style?.template).toBe('classic')
    const [row] = await db.select().from(codes).where(eq(codes.id, c.id))
    expect((row!.content as { style: { template: string } }).style.template).toBe('compact')
    // Changing just the colour keeps the saved template without needing the plan.
    await setPageStyle(ctx(), c.id, { template: 'compact', accent: '#c2410c' })
    expect(lastPut()?.page?.style).toEqual({ template: 'classic', accent: '#c2410c' })
    await setUserPlan(admin(), 'alice', 'unlimited')
    expect(lastPut()?.page?.style?.template).toBe('compact')
  })

  it('only styles contact cards', async () => {
    const link = await createDynamicCode(ctx(), { name: 'L', destination: 'example.com', design })
    await expect(setPageStyle(ctx(), link.id, { template: 'banner' })).rejects.toThrow(
      'Only contact cards',
    )
  })
})
