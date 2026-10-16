import { sql, type Database } from '@qrfinity/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { AdminContext } from '@/lib/server/admin'
import { createDynamicCode, advancedCodeUsage, deleteCode } from '@/lib/server/codes'
import { invalidateFlags, setUserPlan } from '@/lib/server/entitlements'
import { setFreeAdvancedCodeAllowance } from '@/lib/server/settings'
import { FakeEdge, ctxFor, design, freshDb, makeUser } from './helpers'

let db: Database
beforeAll(async () => {
  db = await freshDb()
})
afterAll(() => db.$client.end())
beforeEach(async () => {
  await db.execute(
    sql`truncate codes, feature_flags, app_settings, rate_limits, edge_sync_outbox, audit_log, "user" cascade`,
  )
  invalidateFlags()
  await makeUser(db, 'alice')
  await makeUser(db, 'bob')
})

const admin = (): AdminContext => ({
  db,
  edge: new FakeEdge(),
  mailer: { send: async () => {} },
  actor: 'admin',
  abuseEmail: 'abuse@example.com',
  siteUrl: 'https://qrfinity.com',
})
const make = (user: string, slug?: string) =>
  createDynamicCode(ctxFor(db, user), {
    name: 'Menu',
    destination: 'example.com/menu',
    design,
    slug,
  })

describe('custom short links', () => {
  it('gives each account one free custom link by default, then random ones', async () => {
    const c = await make('alice', ' Joes Menu ')
    expect(c.slug).toBe('joes-menu')
    expect(await advancedCodeUsage(ctxFor(db, 'alice'))).toMatchObject({ used: 1, allowance: 1 })
    await expect(make('alice', 'second-menu')).rejects.toThrow('advanced features on 1 of 1 code')
    // Without a slug, creating still works: random short link.
    expect((await make('alice')).slug).toMatch(/^[0-9A-Za-z]{7}$/)
  })

  it('never hands out a taken link, even after the code is deleted', async () => {
    const c = await make('alice', 'joes-menu')
    await expect(make('bob', 'joes-menu')).rejects.toThrow('That short link is taken')
    await deleteCode(ctxFor(db, 'alice'), c.id)
    await expect(make('bob', 'joes-menu')).rejects.toThrow('That short link is taken')
  })

  it('refuses reserved and look-alike names', async () => {
    await expect(make('alice', 'admin')).rejects.toThrow('isn’t available')
    await expect(make('alice', 'paypal-login')).rejects.toThrow('bank, payment or big-brand')
  })

  it('follows the admin setting, which never takes existing links away', async () => {
    await setFreeAdvancedCodeAllowance(admin(), 3)
    await make('alice', 'menu-one')
    await make('alice', 'menu-two')
    await setFreeAdvancedCodeAllowance(admin(), 1)
    expect(await advancedCodeUsage(ctxFor(db, 'alice'))).toMatchObject({ used: 2, allowance: 1 })
    await expect(make('alice', 'menu-three')).rejects.toThrow('on 2 of 1 code')
    await setFreeAdvancedCodeAllowance(admin(), 0)
    await expect(make('bob', 'bobs-bar')).rejects.toThrow('aren’t available on your account')
    await expect(setFreeAdvancedCodeAllowance(admin(), -1)).rejects.toThrow('0 to 50')
  })

  it('gives more codes with advanced features on paid plans', async () => {
    await setUserPlan(admin(), 'alice', 'starter')
    await make('alice', 'menu-one')
    await make('alice', 'menu-two')
    await make('alice', 'menu-three')
    await expect(make('alice', 'menu-four')).rejects.toThrow('on 3 of 3 codes')
    await setUserPlan(admin(), 'alice', 'unlimited')
    expect((await advancedCodeUsage(ctxFor(db, 'alice'))).allowance).toBe(Number.POSITIVE_INFINITY)
    await make('alice', 'menu-four')
  })
})
