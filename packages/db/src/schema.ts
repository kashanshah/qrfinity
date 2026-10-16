/**
 * Database schema (Postgres). Postgres is the source of truth; the edge KV store holds
 * a disposable copy of each dynamic code's destination for fast redirects.
 */
import type {
  BillingInterval,
  ContentFields,
  ContentType,
  Design,
  LinkStatus,
  PageStyle,
  PaidPlan,
  Plan,
  RedirectRule,
  SubscriptionStatus,
} from '@qrfinity/core'
import { sql } from 'drizzle-orm'
import {
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  pgView,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date())

// ---- Auth (Better Auth). Field names match what Better Auth expects.

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  /** 'admin' can open /admin. Admins can also be granted by email with ADMIN_EMAILS. */
  role: text('role').$type<'user' | 'admin'>().notNull().default('user'),
  /** Set by an admin (Phase 4). A suspended user can't sign in or edit; their codes keep working unless disabled one by one. */
  suspendedAt: timestamp('suspended_at', { withTimezone: true }),
  /**
   * Plan granted by an admin: free, plus, pro or unlimited. The plan in effect is the higher of
   * this and any paying subscription (see effectivePlan in @qrfinity/core).
   */
  plan: text('plan').$type<Plan>().notNull().default('free'),
  /** The payment provider's customer id (Stripe), created at first checkout. */
  billingCustomerId: text('billing_customer_id').unique(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    // IP tracking is disabled in Better Auth; these stay null (no raw IP storage).
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('session_user_idx').on(t.userId)],
)

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('account_user_idx').on(t.userId)],
)

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
)

// ---- Codes

export type CodeKind = 'static' | 'dynamic'
/** What a code holds. Contact cards also keep how their page looks (`style`). */
export type CodeContent = {
  [K in ContentType]: { type: K; fields: ContentFields[K]; style?: PageStyle }
}[ContentType]

export const folders = pgTable(
  'folders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('folders_user_name_idx').on(t.userId, t.name)],
)

export const codes = pgTable(
  'codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<CodeKind>().notNull(),
    name: text('name').notNull(),
    /** Short-link domain and slug (dynamic codes only). Slugs are never reused, even after deletion. */
    domain: text('domain'),
    slug: text('slug'),
    /** For dynamic codes: the http(s) address the short link redirects to. */
    destination: text('destination'),
    /** The form the code was made with, so it can be edited the same way (e.g. a WhatsApp number). */
    content: jsonb('content').$type<CodeContent>(),
    design: jsonb('design').$type<Design>().notNull(),
    status: text('status').$type<LinkStatus>().notNull().default('active'),
    /** Why an admin disabled the code (Phase 4). Never set by the system on its own. */
    disabledReason: text('disabled_reason'),
    /** URL-reputation state of the destination: checked on create/edit and re-checked on a schedule. */
    riskStatus: text('risk_status')
      .$type<'unchecked' | 'clean' | 'flagged'>()
      .notNull()
      .default('unchecked'),
    riskDetail: text('risk_detail'),
    riskCheckedAt: timestamp('risk_checked_at', { withTimezone: true }),
    riskChecks: integer('risk_checks').notNull().default(0),
    nextRiskCheckAt: timestamp('next_risk_check_at', { withTimezone: true }).defaultNow(),
    folderId: uuid('folder_id').references(() => folders.id, { onDelete: 'set null' }),
    /** Increases with every change pushed to the edge. */
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    /** True when the owner chose the slug (counts against their custom short link allowance). */
    customSlug: boolean('custom_slug').notNull().default(false),
    /** Redirect rules (an advanced feature), checked in order before the destination. */
    rules: jsonb('rules').$type<RedirectRule[]>(),
    /**
     * True while the code is beyond its owner's advanced-feature allowance (no plan, or a smaller
     * one). Rules then stop applying and scans go to the destination; custom short links keep
     * working. Maintained by refreshAdvancedFeatures in apps/web/lib/server/codes.ts.
     */
    advancedPaused: boolean('advanced_paused').notNull().default(false),
    /**
     * Password protection (an advanced feature): a salted PBKDF2 hash, never the password. Kept
     * when the code is beyond its owner's allowance, so nothing protected ever becomes public.
     * Never sent to a browser (CodeView carries `hasPassword` instead).
     */
    passwordHash: text('password_hash'),
  },
  (t) => [
    uniqueIndex('codes_domain_slug_idx').on(t.domain, t.slug),
    index('codes_user_idx').on(t.userId, t.createdAt),
    index('codes_risk_due_idx').on(t.nextRiskCheckAt),
  ],
)

export const tags = pgTable(
  'tags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
  },
  (t) => [uniqueIndex('tags_user_name_idx').on(t.userId, t.name)],
)

export const codeTags = pgTable(
  'code_tags',
  {
    codeId: uuid('code_id')
      .notNull()
      .references(() => codes.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.codeId, t.tagId] })],
)

export const destinationHistory = pgTable(
  'destination_history',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    codeId: uuid('code_id')
      .notNull()
      .references(() => codes.id, { onDelete: 'cascade' }),
    oldDestination: text('old_destination'),
    newDestination: text('new_destination').notNull(),
    changedBy: text('changed_by').notNull(),
    changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('destination_history_code_idx').on(t.codeId, t.changedAt)],
)

// ---- Abuse and admin

export type BlocklistKind = 'domain' | 'tld' | 'contains'

/** Destinations we refuse, managed in /admin/blocklist. */
export const blocklist = pgTable(
  'blocklist',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').$type<BlocklistKind>().notNull(),
    value: text('value').notNull(),
    reason: text('reason'),
    createdBy: text('created_by').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('blocklist_kind_value_idx').on(t.kind, t.value)],
)

export type ReportStatus = 'open' | 'dismissed' | 'actioned'

/** "Report this QR code" submissions. The reporter's email is optional. */
export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    codeId: uuid('code_id').references(() => codes.id, { onDelete: 'set null' }),
    /** What the reporter entered: a short link, slug or address. */
    reported: text('reported').notNull(),
    reason: text('reason').notNull(),
    details: text('details'),
    reporterEmail: text('reporter_email'),
    status: text('status').$type<ReportStatus>().notNull().default('open'),
    resolvedBy: text('resolved_by'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index('reports_status_idx').on(t.status, t.createdAt),
    index('reports_code_idx').on(t.codeId),
  ],
)

/** Every admin and automated abuse action. `actor` is a user id or 'system'. */
export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    actor: text('actor').notNull(),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    details: jsonb('details').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [
    index('audit_log_created_idx').on(t.createdAt),
    index('audit_log_target_idx').on(t.targetType, t.targetId),
  ],
)

// ---- Infrastructure

/** Codes whose edge copy still needs updating. Rows are deleted once the edge confirms. */
export const edgeSyncOutbox = pgTable('edge_sync_outbox', {
  codeId: uuid('code_id')
    .primaryKey()
    .references(() => codes.id, { onDelete: 'cascade' }),
  /** The code version that needs pushing. A push of version N clears rows at or below N only. */
  version: integer('version').notNull(),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
  createdAt: createdAt(),
})

/** Fixed-window counters. Keys hold hashed identifiers only, never raw IPs. */
export const rateLimits = pgTable('rate_limits', {
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
  windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
})

/**
 * Scan events for the Postgres analytics backend (local development and self-hosting).
 * Production writes scans to Workers Analytics Engine instead. Same fields, no raw IPs.
 */
export const scanEvents = pgTable(
  'scan_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    codeId: uuid('code_id').notNull(),
    owner: text('owner').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    country: text('country').notNull().default(''),
    region: text('region').notNull().default(''),
    city: text('city').notNull().default(''),
    device: text('device').notNull().default(''),
    os: text('os').notNull().default(''),
    browser: text('browser').notNull().default(''),
    referrer: text('referrer').notNull().default(''),
    visitor: text('visitor').notNull().default(''),
    /** Label of the redirect rule that sent the scan; '' for the main destination. */
    rule: text('rule').notNull().default(''),
  },
  (t) => [
    index('scan_events_code_idx').on(t.codeId, t.at),
    index('scan_events_owner_idx').on(t.owner, t.at),
  ],
)

/** The only thing the redirect Worker's read-only database role can select. */
export const redirectLookup = pgView('redirect_lookup').as((qb) =>
  qb
    .select({
      id: codes.id,
      userId: codes.userId,
      domain: codes.domain,
      slug: codes.slug,
      destination: codes.destination,
      status: codes.status,
      version: codes.version,
      // Paused rules are left out here, so the Worker never sees them.
      rules: sql<
        RedirectRule[] | null
      >`case when ${codes.advancedPaused} then null else ${codes.rules} end`.as('rules'),
      // Password protection is never paused: protected stays protected.
      passwordHash: codes.passwordHash,
      // A contact card code has no destination; the Worker renders its page from this.
      page: sql<CodeContent | null>`case when ${codes.destination} is null and ${codes.content}->>'type' = 'vcard' then ${codes.content} end`.as(
        'page',
      ),
    })
    .from(codes)
    .where(sql`${codes.kind} = 'dynamic' and ${codes.deletedAt} is null`),
)

/** People who asked to hear when Pro launches. One row per address; nothing else is stored. */
export const proWaitlist = pgTable('pro_waitlist', {
  email: text('email').primaryKey(),
  createdAt: createdAt(),
})

/**
 * Feature flags (Phase 6): switch an unreleased or paid feature on for everyone or for listed
 * users. Flags only ever add features; free features don't depend on them.
 */
export const featureFlags = pgTable('feature_flags', {
  key: text('key').primaryKey(),
  enabled: boolean('enabled').notNull().default(false),
  userIds: text('user_ids')
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  updatedBy: text('updated_by'),
  updatedAt: updatedAt(),
})

/**
 * Daily scan totals per code (Phase 6), rolled up each night from the live analytics backend so
 * history outlives Analytics Engine's 90-day retention. One row per code per UTC day with scans.
 */
export const scanDaily = pgTable(
  'scan_daily',
  {
    codeId: uuid('code_id')
      .notNull()
      .references(() => codes.id, { onDelete: 'cascade' }),
    day: date('day', { mode: 'string' }).notNull(),
    scans: integer('scans').notNull(),
    uniques: integer('uniques').notNull(),
    /** Scans per UTC hour, 24 numbers. */
    hours: jsonb('hours').$type<number[]>().notNull(),
    /** Top keys per breakdown for the day: { countries: { CA: 3 }, devices: { mobile: 2 }, … }. */
    breakdowns: jsonb('breakdowns').$type<Record<string, Record<string, number>>>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.codeId, t.day] }), index('scan_daily_day_idx').on(t.day)],
)

/** Admin-editable settings (Phase 6+), e.g. the free custom short link allowance. */
export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedBy: text('updated_by'),
  updatedAt: updatedAt(),
})

/**
 * Paid subscriptions, a copy of the payment provider's state kept current by its webhooks.
 * Rows are kept after a subscription ends, as a record.
 */
export const subscriptions = pgTable(
  'subscriptions',
  {
    /** The provider's subscription id (Stripe sub_...). */
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    customerId: text('customer_id').notNull(),
    plan: text('plan').$type<PaidPlan>().notNull(),
    interval: text('interval').$type<BillingInterval>().notNull(),
    status: text('status').$type<SubscriptionStatus>().notNull(),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    /** End of the free trial, when the subscription started with one. */
    trialEnd: timestamp('trial_end', { withTimezone: true }),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('subscriptions_user_idx').on(t.userId)],
)
