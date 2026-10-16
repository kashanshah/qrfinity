import { describe, expect, it } from 'vitest'
import {
  PAID_PLANS,
  effectivePlan,
  grantsPlan,
  parsePriceLookupKey,
  planPrice,
  priceLookupKey,
} from '../src/billing'

describe('billing', () => {
  it('round-trips price lookup keys for every paid plan and interval', () => {
    for (const plan of PAID_PLANS)
      for (const interval of ['month', 'year'] as const)
        expect(parsePriceLookupKey(priceLookupKey(plan, interval))).toEqual({ plan, interval })
    expect(priceLookupKey('plus', 'month')).toBe('qrfinity_plus_monthly')
  })

  it('ignores prices that are not ours', () => {
    expect(parsePriceLookupKey(null)).toBeNull()
    expect(parsePriceLookupKey('qrfinity_free_monthly')).toBeNull()
    expect(parsePriceLookupKey('qrfinity_business_monthly')).toBeNull()
    expect(parsePriceLookupKey('other_plus_monthly')).toBeNull()
  })

  it('prices plans from PLAN_DETAILS', () => {
    expect(planPrice('plus', 'month')).toBe(5)
    expect(planPrice('pro', 'year')).toBe(200)
  })

  it('keeps the plan while paying or while a failed payment is retried', () => {
    expect(grantsPlan('active')).toBe(true)
    expect(grantsPlan('trialing')).toBe(true)
    expect(grantsPlan('past_due')).toBe(true)
    expect(grantsPlan('unpaid')).toBe(false)
    expect(grantsPlan('canceled')).toBe(false)
    expect(grantsPlan('incomplete')).toBe(false)
  })

  it('stops the plan at once when the first payment after a free trial fails', () => {
    const trialEnd = new Date('2026-11-15T00:00:00Z')
    // Trial ended, first charge failed: the period that started at the trial's end is unpaid.
    expect(grantsPlan({ status: 'past_due', trialEnd, currentPeriodStart: trialEnd })).toBe(false)
    expect(grantsPlan({ status: 'trialing', trialEnd, currentPeriodStart: new Date(0) })).toBe(true)
    // A later renewal that fails keeps the plan during retries, as without a trial.
    const later = new Date('2027-01-15T00:00:00Z')
    expect(grantsPlan({ status: 'past_due', trialEnd, currentPeriodStart: later })).toBe(true)
    expect(grantsPlan({ status: 'past_due', trialEnd: null, currentPeriodStart: later })).toBe(true)
  })

  it('uses the higher of the admin plan and paying subscriptions', () => {
    expect(effectivePlan('free', [])).toBe('free')
    expect(effectivePlan('free', [{ plan: 'plus', status: 'active' }])).toBe('plus')
    expect(effectivePlan('pro', [{ plan: 'plus', status: 'active' }])).toBe('pro')
    expect(effectivePlan('free', [{ plan: 'unlimited', status: 'canceled' }])).toBe('free')
    expect(
      effectivePlan('free', [
        { plan: 'plus', status: 'active' },
        { plan: 'pro', status: 'past_due' },
      ]),
    ).toBe('pro')
  })
})
