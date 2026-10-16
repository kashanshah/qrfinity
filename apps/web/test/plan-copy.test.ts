import { PAID_PLANS } from '@qrfinity/core'
import { describe, expect, it } from 'vitest'
import { planCopy } from '@/lib/plan-copy'

describe('Stripe product copy', () => {
  it('describes what each paid plan adds, within Stripe’s limits', () => {
    expect(planCopy('plus').description).toBe(
      'SVG, PDF and EPS downloads, 4 contact card templates, and custom short links and redirect rules on 10 codes. Your codes keep working whether you pay or not.',
    )
    expect(planCopy('unlimited').features).toEqual([
      'SVG, PDF and EPS downloads for print',
      'All 8 contact card templates',
      'Custom short links and redirect rules on every code',
    ])
    for (const plan of PAID_PLANS) {
      const { description, features } = planCopy(plan)
      expect(description).not.toMatch(/free|forever|never/i)
      // Stripe: marketing feature names up to 80 characters, at most 15 of them.
      for (const f of features) expect(f.length).toBeLessThanOrEqual(80)
      expect(features.length).toBeLessThanOrEqual(15)
    }
  })
})
