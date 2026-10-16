/**
 * Abuse handling: the admin actions (disable/restore codes, suspend users, blocklist),
 * the audit log, and the scheduled destination re-check. Every action is audited.
 */
import {
  isHighConfidence,
  screenDestination,
  type EdgeSync,
  type Mailer,
  type UrlReputation,
} from '@qrfinity/core'
import {
  and,
  asc,
  count,
  auditLog,
  blocklist,
  codes,
  edgeSyncOutbox,
  eq,
  ilike,
  isNull,
  lt,
  ne,
  or,
  reports,
  session,
  sql,
  user,
  type BlocklistKind,
  type Database,
  type ReportStatus,
  type SQL,
} from '@qrfinity/db'
import { syncCode } from './codes'
import { codeDisabledEmail } from './emails'
import { ServiceError } from './errors'
import { likePattern, lower, paged, type ListOptions, type Orderable } from './listing'
import { invalidateBlocklist, loadBlocklist, nextRiskCheck } from './screening'

export type AdminContext = {
  db: Database
  edge: EdgeSync
  mailer: Mailer
  actor: string
  abuseEmail: string
  siteUrl: string
}

export function isAdmin(
  u: { email: string; role?: string | null },
  adminEmails: string[],
): boolean {
  return u.role === 'admin' || adminEmails.includes(u.email.toLowerCase())
}

export async function audit(
  db: Database,
  actor: string,
  action: string,
  targetType: string,
  targetId: string,
  details?: Record<string, unknown>,
) {
  await db
    .insert(auditLog)
    .values({ actor, action, targetType, targetId, details: details ?? null })
}

// ---------------------------------------------------------------------------
// Overview and lists

export async function adminStats(db: Database) {
  const [r] = await db.execute<{
    open_reports: number
    flagged: number
    disabled: number
    users: number
    codes: number
  }>(sql`
    select
      (select count(*)::int from reports where status = 'open') as open_reports,
      (select count(*)::int from codes where risk_status = 'flagged' and status <> 'disabled' and deleted_at is null) as flagged,
      (select count(*)::int from codes where status = 'disabled' and deleted_at is null) as disabled,
      (select count(*)::int from "user") as users,
      (select count(*)::int from codes where deleted_at is null) as codes`)
  return r!
}

export const REPORT_SORTS = ['received', 'reason', 'reported'] as const
export type ReportSort = (typeof REPORT_SORTS)[number]

/** Reports with a given status and the code they point to, searchable and one page at a time. */
export async function listReports(
  db: Database,
  status: ReportStatus = 'open',
  q = '',
  opts: ListOptions = {},
) {
  const term = q.trim()
  const like = likePattern(term)
  const where = and(
    eq(reports.status, status),
    term
      ? or(
          ilike(reports.reported, like),
          ilike(reports.details, like),
          ilike(reports.reporterEmail, like),
          ilike(codes.name, like),
          ilike(codes.destination, like),
          ilike(user.email, like),
        )
      : undefined,
  )
  return paged(opts, {
    sorts: {
      received: reports.createdAt,
      reason: reports.reason,
      reported: lower(reports.reported),
    } satisfies Record<ReportSort, Orderable>,
    defaultSort: 'received',
    defaultDir: 'desc',
    tiebreak: reports.id,
    count: async () => {
      const [r] = await db
        .select({ n: count() })
        .from(reports)
        .leftJoin(codes, eq(codes.id, reports.codeId))
        .leftJoin(user, eq(user.id, codes.userId))
        .where(where)
      return r?.n ?? 0
    },
    rows: (orderBy, limit, offset) =>
      db
        .select({
          report: reports,
          code: {
            id: codes.id,
            name: codes.name,
            slug: codes.slug,
            destination: codes.destination,
            status: codes.status,
          },
          ownerEmail: user.email,
        })
        .from(reports)
        .leftJoin(codes, eq(codes.id, reports.codeId))
        .leftJoin(user, eq(user.id, codes.userId))
        .where(where)
        .orderBy(...orderBy)
        .limit(limit)
        .offset(offset),
  })
}

export const CODE_SORTS = ['name', 'link', 'owner', 'status', 'created', 'checked'] as const
export type CodeSort = (typeof CODE_SORTS)[number]

const codeSorts = {
  name: lower(codes.name),
  link: codes.slug,
  owner: lower(user.email),
  status: codes.status,
  created: codes.createdAt,
  checked: codes.riskCheckedAt,
} satisfies Record<CodeSort, Orderable>

function pagedCodes(
  db: Database,
  where: SQL | undefined,
  opts: ListOptions,
  defaultSort: CodeSort,
) {
  return paged(opts, {
    sorts: codeSorts,
    defaultSort,
    defaultDir: 'desc',
    tiebreak: codes.id,
    count: async () => {
      const [r] = await db
        .select({ n: count() })
        .from(codes)
        .innerJoin(user, eq(user.id, codes.userId))
        .where(where)
      return r?.n ?? 0
    },
    rows: (orderBy, limit, offset) =>
      db
        .select({ code: codes, ownerEmail: user.email })
        .from(codes)
        .innerJoin(user, eq(user.id, codes.userId))
        .where(where)
        .orderBy(...orderBy)
        .limit(limit)
        .offset(offset),
  })
}

/** Search terms for codes: a pasted short link or slug, a destination, an owner email or a name. */
function codeSearch(q: string) {
  const term = q.trim()
  if (!term) return undefined
  const like = likePattern(term)
  const slug = term.replace(/^https?:\/\/[^/]+\//, '').replace(/\/$/, '')
  return or(
    eq(codes.slug, slug),
    ilike(codes.destination, like),
    ilike(user.email, like),
    ilike(codes.name, like),
  )
}

/** Live codes the scheduled re-check flagged, most recently checked first by default. */
export async function listFlaggedCodes(db: Database, q = '', opts: ListOptions = {}) {
  const where = and(
    eq(codes.riskStatus, 'flagged'),
    ne(codes.status, 'disabled'),
    isNull(codes.deletedAt),
    codeSearch(q),
  )
  return pagedCodes(db, where, opts, 'checked')
}

/** Codes matching a search (every code when empty), newest first by default. */
export async function searchCodes(db: Database, q: string, opts: ListOptions = {}) {
  return pagedCodes(db, and(isNull(codes.deletedAt), codeSearch(q)), opts, 'created')
}

export const USER_SORTS = ['email', 'joined', 'codes', 'plan', 'status'] as const
export type UserSort = (typeof USER_SORTS)[number]

/** Users matching an email or name search (all users when empty), newest first by default. */
export async function searchUsers(db: Database, q: string, opts: ListOptions = {}) {
  const term = q.trim()
  const like = likePattern(term)
  const where = term ? or(ilike(user.email, like), ilike(user.name, like)) : undefined
  // Qualified on purpose: inside the subquery a bare "id" would mean codes.id (a uuid), not the user's id.
  const codeCount = sql<number>`(select count(*)::int from codes c where c.user_id = "user"."id" and c.deleted_at is null)`
  return paged(opts, {
    sorts: {
      email: lower(user.email),
      joined: user.createdAt,
      codes: codeCount,
      plan: user.plan,
      // Suspended accounts first when descending; active ones have no date and sort last.
      status: user.suspendedAt,
    } satisfies Record<UserSort, Orderable>,
    defaultSort: 'joined',
    defaultDir: 'desc',
    tiebreak: user.id,
    count: async () => {
      const [r] = await db.select({ n: count() }).from(user).where(where)
      return r?.n ?? 0
    },
    rows: (orderBy, limit, offset) =>
      db
        .select({
          id: user.id,
          email: user.email,
          name: user.name,
          createdAt: user.createdAt,
          suspendedAt: user.suspendedAt,
          role: user.role,
          plan: user.plan,
          codes: codeCount,
        })
        .from(user)
        .where(where)
        .orderBy(...orderBy)
        .limit(limit)
        .offset(offset),
  })
}

export const AUDIT_SORTS = ['when', 'who', 'action', 'target'] as const
export type AuditSort = (typeof AUDIT_SORTS)[number]

/** The audit log, newest first by default, searchable by who, what, target or details. */
export async function listAudit(db: Database, q = '', opts: ListOptions = {}) {
  const term = q.trim()
  const like = likePattern(term)
  const where = term
    ? or(
        ilike(auditLog.actor, like),
        ilike(auditLog.action, like),
        ilike(auditLog.targetId, like),
        ilike(sql`${auditLog.details}::text`, like),
      )
    : undefined
  return paged(opts, {
    sorts: {
      when: auditLog.createdAt,
      who: lower(auditLog.actor),
      action: auditLog.action,
      target: sql`${auditLog.targetType} || ':' || ${auditLog.targetId}`,
    } satisfies Record<AuditSort, Orderable>,
    defaultSort: 'when',
    defaultDir: 'desc',
    tiebreak: auditLog.id,
    count: async () => {
      const [r] = await db.select({ n: count() }).from(auditLog).where(where)
      return r?.n ?? 0
    },
    rows: (orderBy, limit, offset) =>
      db
        .select()
        .from(auditLog)
        .where(where)
        .orderBy(...orderBy)
        .limit(limit)
        .offset(offset),
  })
}

export const BLOCK_SORTS = ['value', 'kind', 'reason', 'by', 'added'] as const
export type BlockSort = (typeof BLOCK_SORTS)[number]

/** Blocklist entries, alphabetical by default, searchable by value or reason. */
export async function listBlocklist(db: Database, q = '', opts: ListOptions = {}) {
  const term = q.trim()
  const like = likePattern(term)
  const where = term ? or(ilike(blocklist.value, like), ilike(blocklist.reason, like)) : undefined
  return paged(opts, {
    sorts: {
      value: lower(blocklist.value),
      kind: blocklist.kind,
      reason: lower(blocklist.reason),
      by: lower(blocklist.createdBy),
      added: blocklist.createdAt,
    } satisfies Record<BlockSort, Orderable>,
    defaultSort: 'value',
    defaultDir: 'asc',
    tiebreak: blocklist.id,
    count: async () => {
      const [r] = await db.select({ n: count() }).from(blocklist).where(where)
      return r?.n ?? 0
    },
    rows: (orderBy, limit, offset) =>
      db
        .select()
        .from(blocklist)
        .where(where)
        .orderBy(...orderBy)
        .limit(limit)
        .offset(offset),
  })
}

// ---------------------------------------------------------------------------
// Actions

async function findCode(db: Database, id: string) {
  const [row] = await db
    .select({ code: codes, ownerEmail: user.email })
    .from(codes)
    .innerJoin(user, eq(user.id, codes.userId))
    .where(eq(codes.id, id))
  if (!row) throw new ServiceError('That code doesn’t exist.', 'not_found')
  return row
}

/** Turns a code off: scans see a warning page, never the destination. One click in /admin. */
export async function disableCode(
  ctx: AdminContext,
  codeId: string,
  reason: string,
  opts: { notify?: boolean } = {},
) {
  const { code, ownerEmail } = await findCode(ctx.db, codeId)
  const why = reason.trim().slice(0, 300) || 'Breaks our acceptable use policy'
  if (code.status !== 'disabled') {
    await ctx.db.transaction(async (tx) => {
      const [u] = await tx
        .update(codes)
        .set({ status: 'disabled', disabledReason: why, version: sql`${codes.version} + 1` })
        .where(eq(codes.id, codeId))
        .returning({ version: codes.version })
      await tx
        .insert(edgeSyncOutbox)
        .values({ codeId, version: u!.version })
        .onConflictDoUpdate({
          target: edgeSyncOutbox.codeId,
          set: { version: sql`greatest(${edgeSyncOutbox.version}, ${u!.version})` },
        })
    })
    await syncCode(ctx.db, ctx.edge, codeId)
  }
  await ctx.db
    .update(reports)
    .set({ status: 'actioned', resolvedBy: ctx.actor, resolvedAt: new Date() })
    .where(and(eq(reports.codeId, codeId), eq(reports.status, 'open')))
  await audit(ctx.db, ctx.actor, 'code.disable', 'code', codeId, {
    reason: why,
    destination: code.destination,
    slug: code.slug,
  })
  if (opts.notify !== false && code.status !== 'disabled') {
    await ctx.mailer
      .send(
        codeDisabledEmail({
          to: ownerEmail,
          name: code.name,
          shortLink: `${code.domain}/${code.slug}`,
          destination: code.destination,
          reason: why,
          abuseEmail: ctx.abuseEmail,
          siteUrl: ctx.siteUrl,
        }),
      )
      .catch((e) => console.error('Could not email the code owner', e))
  }
}

export async function restoreCode(ctx: AdminContext, codeId: string) {
  const { code } = await findCode(ctx.db, codeId)
  if (code.status !== 'disabled') return
  await ctx.db.transaction(async (tx) => {
    const [u] = await tx
      .update(codes)
      .set({
        status: 'active',
        disabledReason: null,
        riskStatus: 'unchecked',
        nextRiskCheckAt: new Date(),
        version: sql`${codes.version} + 1`,
      })
      .where(eq(codes.id, codeId))
      .returning({ version: codes.version })
    await tx
      .insert(edgeSyncOutbox)
      .values({ codeId, version: u!.version })
      .onConflictDoUpdate({
        target: edgeSyncOutbox.codeId,
        set: { version: sql`greatest(${edgeSyncOutbox.version}, ${u!.version})` },
      })
  })
  await syncCode(ctx.db, ctx.edge, codeId)
  await audit(ctx.db, ctx.actor, 'code.restore', 'code', codeId)
}

/** Marks a flagged code as reviewed and fine. */
export async function clearFlag(ctx: AdminContext, codeId: string) {
  await ctx.db
    .update(codes)
    .set({ riskStatus: 'clean', riskDetail: null })
    .where(eq(codes.id, codeId))
  await audit(ctx.db, ctx.actor, 'code.clear_flag', 'code', codeId)
}

export async function resolveReport(
  ctx: AdminContext,
  reportId: string,
  status: Exclude<ReportStatus, 'open'>,
) {
  await ctx.db
    .update(reports)
    .set({ status, resolvedBy: ctx.actor, resolvedAt: new Date() })
    .where(eq(reports.id, reportId))
  await audit(ctx.db, ctx.actor, `report.${status}`, 'report', reportId)
}

/**
 * Suspends a user: signs them out everywhere and blocks sign-in. Their codes keep working
 * (codes never expire); disable individual codes if they're abusive.
 */
export async function suspendUser(ctx: AdminContext, userId: string, reason: string) {
  await ctx.db.update(user).set({ suspendedAt: new Date() }).where(eq(user.id, userId))
  await ctx.db.delete(session).where(eq(session.userId, userId))
  await audit(ctx.db, ctx.actor, 'user.suspend', 'user', userId, { reason: reason.slice(0, 300) })
}

export async function unsuspendUser(ctx: AdminContext, userId: string) {
  await ctx.db.update(user).set({ suspendedAt: null }).where(eq(user.id, userId))
  await audit(ctx.db, ctx.actor, 'user.unsuspend', 'user', userId)
}

const KINDS: BlocklistKind[] = ['domain', 'tld', 'contains']

export async function addBlock(ctx: AdminContext, kind: string, value: string, reason: string) {
  if (!KINDS.includes(kind as BlocklistKind))
    throw new ServiceError('Choose domain, top-level domain or “address contains”.', 'invalid')
  const v = value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^\./, '')
  if (v.length < 2 || v.length > 200)
    throw new ServiceError('Enter a value between 2 and 200 characters.', 'invalid')
  await ctx.db
    .insert(blocklist)
    .values({
      kind: kind as BlocklistKind,
      value: v,
      reason: reason.trim() || null,
      createdBy: ctx.actor,
    })
    .onConflictDoNothing()
  invalidateBlocklist()
  await audit(ctx.db, ctx.actor, 'blocklist.add', 'blocklist', `${kind}:${v}`, { reason })
}

export async function removeBlock(ctx: AdminContext, id: string) {
  const [row] = await ctx.db.delete(blocklist).where(eq(blocklist.id, id)).returning()
  invalidateBlocklist()
  if (row)
    await audit(ctx.db, ctx.actor, 'blocklist.remove', 'blocklist', `${row.kind}:${row.value}`)
}

// ---------------------------------------------------------------------------
// Scheduled re-check

/**
 * Re-checks destinations that are due (see nextRiskCheck), spending at most `budget`
 * Web Risk lookups. Each distinct destination is looked up once per run.
 * - Blocklist hit → flagged for review (stays live).
 * - Web Risk MALWARE or SOCIAL_ENGINEERING → turned off now, owner emailed, audited as 'system'.
 * - Other Web Risk threats → flagged for review.
 */
export async function runRiskChecks(
  ctx: Omit<AdminContext, 'actor'>,
  reputation: UrlReputation,
  budget: number,
) {
  const due = await ctx.db
    .select()
    .from(codes)
    .where(
      and(
        eq(codes.kind, 'dynamic'),
        isNull(codes.deletedAt),
        ne(codes.status, 'disabled'),
        lt(codes.nextRiskCheckAt, sql`now()`),
      ),
    )
    .orderBy(asc(codes.nextRiskCheckAt))
    .limit(Math.max(1, budget) * 3)
  const list = await loadBlocklist(ctx.db)
  const results = new Map<string, Awaited<ReturnType<UrlReputation['check']>>>()
  const summary = { checked: 0, lookups: 0, flagged: 0, disabled: 0, deferred: 0 }
  const system: AdminContext = { ...ctx, actor: 'system' }

  for (const code of due) {
    if (!code.destination) continue
    const now = new Date()
    const hit = screenDestination(code.destination, list)
    if (hit) {
      await ctx.db
        .update(codes)
        .set({
          riskStatus: 'flagged',
          riskDetail: `Blocklist: ${hit.rule} ${hit.value}`,
          riskCheckedAt: now,
          nextRiskCheckAt: nextRiskCheck(3, now),
        })
        .where(eq(codes.id, code.id))
      await audit(ctx.db, 'system', 'code.flag', 'code', code.id, {
        rule: hit.rule,
        value: hit.value,
      })
      summary.flagged++
      continue
    }
    let r = results.get(code.destination)
    if (!r) {
      if (summary.lookups >= budget) break
      r = await reputation.check(code.destination)
      summary.lookups++
      results.set(code.destination, r)
    }
    summary.checked++
    if (r.status === 'unknown') {
      // Not configured or unreachable: try again later without counting it as a check.
      await ctx.db
        .update(codes)
        .set({
          nextRiskCheckAt: new Date(
            now.getTime() + (reputation.configured ? 3_600_000 : 6 * 3_600_000),
          ),
        })
        .where(eq(codes.id, code.id))
      summary.deferred++
    } else if (r.status === 'clean') {
      await ctx.db
        .update(codes)
        .set({
          riskStatus: 'clean',
          riskDetail: null,
          riskCheckedAt: now,
          riskChecks: code.riskChecks + 1,
          nextRiskCheckAt: nextRiskCheck(code.riskChecks + 1, now),
        })
        .where(eq(codes.id, code.id))
    } else {
      const detail = `Google Web Risk: ${r.threats.join(', ')}`
      await ctx.db
        .update(codes)
        .set({
          riskStatus: 'flagged',
          riskDetail: detail,
          riskCheckedAt: now,
          riskChecks: code.riskChecks + 1,
          nextRiskCheckAt: nextRiskCheck(code.riskChecks + 1, now),
        })
        .where(eq(codes.id, code.id))
      if (isHighConfidence(r.threats)) {
        await disableCode(
          system,
          code.id,
          `Google Web Risk lists the destination as ${r.threats.map(threatLabel).join(' and ')}.`,
        )
        summary.disabled++
      } else {
        await audit(ctx.db, 'system', 'code.flag', 'code', code.id, { threats: r.threats })
        summary.flagged++
      }
    }
  }
  return summary
}

function threatLabel(t: string) {
  return t === 'MALWARE'
    ? 'malware'
    : t === 'SOCIAL_ENGINEERING'
      ? 'phishing'
      : t.toLowerCase().replace(/_/g, ' ')
}
