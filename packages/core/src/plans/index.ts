/**
 * Plans and features (pricing model decided 2026-10-16, see docs/decisions.md).
 *
 * Plain static and dynamic codes are unlimited and free. Advanced features (custom short links,
 * redirect rules, password protection, split traffic, date and scan limits) can be used on a
 * limited number of codes: 1 free, more on paid plans. Plan features (print formats, more contact card templates) come with any paid
 * plan (2026-10-16, before launch). Stopping paying never breaks a code; it only stops adding
 * paid extras to more codes.
 *
 * FREE_FEATURES is what the free plan includes; test/plans.test.ts fails if anything is removed
 * from it without updating the test, so a change is always deliberate.
 */

export const PLANS = ['free', 'plus', 'pro', 'unlimited'] as const
export type Plan = (typeof PLANS)[number]

export type PlanDetails = {
  name: string
  /** Codes that may use advanced features. Free comes from the admin setting (default 1). */
  advancedCodes: number
  /** USD; null for free. Shown on the pricing page; no checkout until billing exists. */
  monthlyUsd: number | null
  yearlyUsd: number | null
}

export const PLAN_DETAILS: Record<Plan, PlanDetails> = {
  free: { name: 'Free', advancedCodes: 1, monthlyUsd: null, yearlyUsd: null },
  plus: { name: 'Plus', advancedCodes: 10, monthlyUsd: 5, yearlyUsd: 50 },
  pro: { name: 'Pro', advancedCodes: 100, monthlyUsd: 20, yearlyUsd: 200 },
  unlimited: {
    name: 'Unlimited',
    advancedCodes: Number.POSITIVE_INFINITY,
    monthlyUsd: 50,
    yearlyUsd: 500,
  },
}

/** Everything QRfinity offers or plans to offer. */
export const FEATURES = {
  // Free for everyone, without limits
  staticCodes: 'Unlimited static codes, no sign-up',
  dynamicCodes: 'Unlimited dynamic codes that never expire',
  editDestination: 'Edit where a dynamic code points',
  fullDesign: 'Every design option: colours, shapes, logo, frames',
  rasterFormats: 'PNG and JPG downloads',
  vectorFormats: 'SVG, PDF and EPS downloads for print',
  contactTemplates: 'Contact card page templates',
  analytics90: 'Scan analytics with CSV download',
  analyticsHistory: 'Full analytics history (1 and 2 years)',
  dataExport: 'Export every code and its history',
  // Advanced features: free on a limited number of codes, more with a plan
  customSlugs: 'Custom short links, like qrfinity.link/joes-menu',
  redirectRules: 'Redirect rules by device, country or time',
  passwordProtection: 'Password-protected codes',
  splitTraffic: 'Split traffic between versions (A/B tests)',
  limits: 'Switch destination after a date or a number of scans',
  // Planned or later, scope not decided (custom domains: only if customers ask)
  customDomain: 'Your own short domain, like go.joescafe.com',
  bulkCreate: 'Bulk creation from a spreadsheet',
  teamSeats: 'Team seats',
  api: 'API access',
} as const

export type Feature = keyof typeof FEATURES

export const FREE_FEATURES = [
  'staticCodes',
  'dynamicCodes',
  'editDestination',
  'fullDesign',
  'rasterFormats',
  'analytics90',
  'analyticsHistory',
  'dataExport',
] as const satisfies readonly Feature[]

/** Count against the advanced-code allowance. */
export const ADVANCED_FEATURES = [
  'customSlugs',
  'redirectRules',
  'passwordProtection',
  'splitTraffic',
  'limits',
] as const satisfies readonly Feature[]
export type AdvancedFeature = (typeof ADVANCED_FEATURES)[number]

/** Come with any paid plan (not counted per code). */
export const PLAN_FEATURES = ['vectorFormats'] as const satisfies readonly Feature[]
export type PlanFeature = (typeof PLAN_FEATURES)[number]

/** Contact card page templates each plan can choose from (the first ones in the list). */
export const CONTACT_TEMPLATES_BY_PLAN: Record<Plan, number> = {
  free: 2,
  plus: 4,
  pro: 6,
  unlimited: 8,
}

/** The cheapest plan whose templates include the one at `index` in PAGE_TEMPLATES. */
export function planForTemplateIndex(index: number): Plan {
  return PLANS.find((p) => CONTACT_TEMPLATES_BY_PLAN[p] > index) ?? 'unlimited'
}

/** Built and available to everyone (within the allowance where it applies). Others need a feature flag. */
export const RELEASED_FEATURES: readonly Feature[] = [
  ...FREE_FEATURES,
  'customSlugs',
  'redirectRules',
  'contactTemplates',
  'passwordProtection',
  'splitTraffic',
  'limits',
]

export function isPlan(v: unknown): v is Plan {
  return typeof v === 'string' && (PLANS as readonly string[]).includes(v)
}

export function isFeature(v: unknown): v is Feature {
  return typeof v === 'string' && Object.hasOwn(FEATURES, v)
}

/** A feature flag as stored: on for everyone, or for listed users only. */
export type FeatureFlag = { key: Feature; enabled: boolean; userIds: readonly string[] }

/**
 * What one user can use: every released feature, plan features on a paid plan, plus features whose
 * flag is on for them (an admin can grant a plan feature this way too). The plan also sets how many
 * codes may use advanced features.
 */
export function entitlements(
  plan: Plan,
  flags: readonly FeatureFlag[],
  userId: string,
): Set<Feature> {
  const set = new Set<Feature>(RELEASED_FEATURES)
  if (plan !== 'free') for (const f of PLAN_FEATURES) set.add(f)
  for (const f of flags) if (f.enabled || f.userIds.includes(userId)) set.add(f.key)
  return set
}

/** Default free allowance of codes with advanced features. Admins can raise it (never below what exists). */
export const DEFAULT_FREE_ADVANCED_CODES = 1

/** How many codes may use advanced features on this plan. */
export function advancedCodeAllowance(plan: Plan, freeAllowance: number): number {
  return plan === 'free' ? freeAllowance : Math.max(PLAN_DETAILS[plan].advancedCodes, freeAllowance)
}

/** Days of analytics a user can choose. History beyond 90 days comes from daily roll-ups. */
export function analyticsRanges(features: ReadonlySet<Feature>): number[] {
  return features.has('analyticsHistory') ? [7, 30, 90, 365, 730] : [7, 30, 90]
}
