/**
 * Database schema (Postgres). Postgres is the source of truth; the edge KV store holds
 * a disposable copy of each dynamic code's destination for fast redirects.
 */
import type { ContentFields, ContentType, Design, LinkStatus } from '@qrfinity/core'
import { sql } from 'drizzle-orm'
import {
  bigserial,
  boolean,
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
  /** Set by an admin (Phase 4). A suspended user can't sign in or edit; their codes keep working unless disabled one by one. */
  suspendedAt: timestamp('suspended_at', { withTimezone: true }),
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
export type CodeContent = { [K in ContentType]: { type: K; fields: ContentFields[K] } }[ContentType]

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
    folderId: uuid('folder_id').references(() => folders.id, { onDelete: 'set null' }),
    /** Increases with every change pushed to the edge. */
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('codes_domain_slug_idx').on(t.domain, t.slug),
    index('codes_user_idx').on(t.userId, t.createdAt),
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
    })
    .from(codes)
    .where(sql`${codes.kind} = 'dynamic' and ${codes.deletedAt} is null`),
)
