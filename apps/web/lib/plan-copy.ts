import {
  CONTACT_TEMPLATES_BY_PLAN,
  PAGE_TEMPLATES,
  PLAN_DETAILS,
  type PaidPlan,
} from '@qrfinity/core'

const codes = (n: number) => (Number.isFinite(n) ? `${n} codes` : 'every code')
const templates = (n: number) =>
  n >= PAGE_TEMPLATES.length ? `all ${n} contact card templates` : `${n} contact card templates`

/**
 * What a plan adds, as Stripe shows it (product description, and the feature list on pricing
 * tables and the customer portal). Built from the same plan data as the pricing page.
 */
export function planCopy(plan: PaidPlan) {
  const d = PLAN_DETAILS[plan]
  const features = [
    'SVG, PDF and EPS downloads for print',
    templates(CONTACT_TEMPLATES_BY_PLAN[plan]).replace(/^./, (c) => c.toUpperCase()),
    `Custom short links and redirect rules on ${codes(d.advancedCodes)}`,
  ]
  return {
    description: `SVG, PDF and EPS downloads, ${templates(CONTACT_TEMPLATES_BY_PLAN[plan])}, and custom short links and redirect rules on ${codes(d.advancedCodes)}. Your codes keep working whether you pay or not.`,
    features,
  }
}
