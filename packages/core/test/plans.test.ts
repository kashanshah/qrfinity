import { describe, expect, it } from 'vitest'
import { FEATURES, FREE_FEATURES, PLAN_FEATURES, analyticsRanges, entitlements } from '../src/plans'

describe('plans', () => {
  it('keeps the free promise: these features are free, forever', () => {
    // Removing anything from this list breaks the promise on the pricing page. Don't.
    expect([...FREE_FEATURES].sort()).toEqual(
      [
        'allFormats',
        'analytics90',
        'customSlugs',
        'dataExport',
        'dynamicCodes',
        'editDestination',
        'fullDesign',
        'staticCodes',
      ].sort(),
    )
  })

  it('gives every plan everything in the plans below it', () => {
    for (const f of PLAN_FEATURES.free) expect(PLAN_FEATURES.pro).toContain(f)
    for (const f of PLAN_FEATURES.pro) expect(PLAN_FEATURES.business).toContain(f)
    for (const f of Object.keys(FEATURES)) expect(PLAN_FEATURES.business).toContain(f)
  })

  it('lets flags add features for everyone or for listed users, never remove free ones', () => {
    const free = entitlements('free', [], 'u1')
    expect(free.has('dynamicCodes')).toBe(true)
    expect(free.has('analyticsHistory')).toBe(false)
    const flags = [
      { key: 'analyticsHistory' as const, enabled: false, userIds: ['u1'] },
      { key: 'bulkCreate' as const, enabled: true, userIds: [] },
    ]
    expect(entitlements('free', flags, 'u1').has('analyticsHistory')).toBe(true)
    expect(entitlements('free', flags, 'u2').has('analyticsHistory')).toBe(false)
    expect(entitlements('free', flags, 'u2').has('bulkCreate')).toBe(true)
    expect(entitlements('pro', [], 'u3').has('analyticsHistory')).toBe(true)
  })

  it('offers longer analytics ranges only with history', () => {
    expect(analyticsRanges(entitlements('free', [], 'u'))).toEqual([7, 30, 90])
    expect(analyticsRanges(entitlements('pro', [], 'u'))).toContain(365)
  })
})
