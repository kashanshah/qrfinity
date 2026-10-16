import { describe, expect, it } from 'vitest'
import {
  ADVANCED_FEATURES,
  FREE_FEATURES,
  PLANS,
  PLAN_DETAILS,
  advancedCodeAllowance,
  analyticsRanges,
  entitlements,
} from '../src/plans'

describe('plans', () => {
  it('keeps the free promise: these features are free, forever', () => {
    // Removing anything from this list breaks the promise on the pricing page and in the terms. Don't.
    expect([...FREE_FEATURES].sort()).toEqual(
      [
        'allFormats',
        'analytics90',
        'analyticsHistory',
        'dataExport',
        'dynamicCodes',
        'editDestination',
        'fullDesign',
        'staticCodes',
      ].sort(),
    )
  })

  it('never makes a free feature an advanced (allowance-limited) one', () => {
    for (const f of ADVANCED_FEATURES) expect(FREE_FEATURES as readonly string[]).not.toContain(f)
  })

  it('gives each paid plan more advanced codes than the one below, at a higher price', () => {
    for (let i = 1; i < PLANS.length; i++) {
      const lower = PLAN_DETAILS[PLANS[i - 1]!]
      const higher = PLAN_DETAILS[PLANS[i]!]
      expect(higher.advancedCodes).toBeGreaterThan(lower.advancedCodes)
      expect(higher.monthlyUsd ?? 0).toBeGreaterThan(lower.monthlyUsd ?? 0)
    }
    expect(PLAN_DETAILS.unlimited.advancedCodes).toBe(Number.POSITIVE_INFINITY)
  })

  it('uses the admin setting for free and never gives a paid plan less', () => {
    expect(advancedCodeAllowance('free', 1)).toBe(1)
    expect(advancedCodeAllowance('free', 2)).toBe(2)
    expect(advancedCodeAllowance('starter', 1)).toBe(3)
    expect(advancedCodeAllowance('starter', 5)).toBe(5)
    expect(advancedCodeAllowance('unlimited', 1)).toBe(Number.POSITIVE_INFINITY)
  })

  it('gives every feature to everyone once released; flags reveal unreleased ones', () => {
    const free = entitlements('free', [], 'u1')
    expect(free.has('dynamicCodes')).toBe(true)
    expect(free.has('analyticsHistory')).toBe(true)
    expect(free.has('customSlugs')).toBe(true)
    expect(free.has('redirectRules')).toBe(false)
    const flags = [{ key: 'redirectRules' as const, enabled: false, userIds: ['u1'] }]
    expect(entitlements('free', flags, 'u1').has('redirectRules')).toBe(true)
    expect(entitlements('unlimited', flags, 'u2').has('redirectRules')).toBe(false)
    expect(analyticsRanges(free)).toContain(365)
  })
})
