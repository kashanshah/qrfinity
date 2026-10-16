/**
 * Plans and what each one includes. No billing exists yet: a user's plan is set by an admin,
 * and unreleased features are switched on with feature flags (see apps/web/lib/server/entitlements.ts).
 *
 * The rule this file enforces: free features never move behind a paywall. FREE_FEATURES is a
 * public promise; test/plans.test.ts fails if anything is removed from it or from a higher plan.
 */

export const PLANS = ['free', 'pro', 'business'] as const
export type Plan = (typeof PLANS)[number]

/** Everything QRfinity offers or plans to offer, free or paid. */
export const FEATURES = {
  // Free forever
  staticCodes: 'Unlimited static codes, no sign-up',
  dynamicCodes: 'Unlimited dynamic codes that never expire',
  editDestination: 'Edit where a dynamic code points',
  fullDesign: 'Every design option: colours, shapes, logo, frames',
  allFormats: 'Every format: PNG, JPG, SVG, PDF and EPS',
  analytics90: 'Scan analytics for the last 90 days, with CSV download',
  dataExport: 'Export every code and its history',
  // Pro (planned)
  analyticsHistory: 'Full analytics history',
  customDomain: 'Your own branded short domain',
  bulkCreate: 'Bulk creation from a spreadsheet',
  redirectRules: 'Redirect rules by country, device or time',
  passwordProtection: 'Password-protected codes',
  utmBuilder: 'UTM link builder',
  retargetingPixels: 'Retargeting pixels',
  // Business (planned)
  teamSeats: 'Team seats',
  clientWorkspaces: 'Client workspaces',
  api: 'API access',
  whiteLabel: 'White label',
  landingPages: 'Hosted landing pages: menu, vCard, PDF, link in bio',
} as const

export type Feature = keyof typeof FEATURES

export const FREE_FEATURES = [
  'staticCodes',
  'dynamicCodes',
  'editDestination',
  'fullDesign',
  'allFormats',
  'analytics90',
  'dataExport',
] as const satisfies readonly Feature[]

const PRO_ONLY = [
  'analyticsHistory',
  'customDomain',
  'bulkCreate',
  'redirectRules',
  'passwordProtection',
  'utmBuilder',
  'retargetingPixels',
] as const satisfies readonly Feature[]

const BUSINESS_ONLY = [
  'teamSeats',
  'clientWorkspaces',
  'api',
  'whiteLabel',
  'landingPages',
] as const satisfies readonly Feature[]

/** Each plan includes everything in the plans below it. */
export const PLAN_FEATURES: Record<Plan, readonly Feature[]> = {
  free: FREE_FEATURES,
  pro: [...FREE_FEATURES, ...PRO_ONLY],
  business: [...FREE_FEATURES, ...PRO_ONLY, ...BUSINESS_ONLY],
}

export function isPlan(v: unknown): v is Plan {
  return typeof v === 'string' && (PLANS as readonly string[]).includes(v)
}

export function isFeature(v: unknown): v is Feature {
  return typeof v === 'string' && Object.hasOwn(FEATURES, v)
}

/** A feature flag as stored: on for everyone, or for listed users only. */
export type FeatureFlag = { key: Feature; enabled: boolean; userIds: readonly string[] }

/**
 * What one user can use: their plan's features plus any flag switched on for them.
 * Flags can only add features. Free features are always included, whatever the plan or flags say.
 */
export function entitlements(
  plan: Plan,
  flags: readonly FeatureFlag[],
  userId: string,
): Set<Feature> {
  const set = new Set<Feature>([...FREE_FEATURES, ...PLAN_FEATURES[plan]])
  for (const f of flags) if (f.enabled || f.userIds.includes(userId)) set.add(f.key)
  return set
}

/** Days of analytics a user can see in the dashboard. History beyond 90 days comes from daily roll-ups. */
export function analyticsRanges(features: ReadonlySet<Feature>): number[] {
  return features.has('analyticsHistory') ? [7, 30, 90, 365, 730] : [7, 30, 90]
}
