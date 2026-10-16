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
  auditLog,
  blocklist,
  codes,
  desc,
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
} from '@qrfinity/db'
import { syncCode } from './codes'
import { codeDisabledEmail } from './emails'
import { ServiceError } from './errors'
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

export async function listReports(db: Database, status: ReportStatus = 'open') {
  return db
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
    .where(eq(reports.status, status))
    .orderBy(desc(reports.createdAt))
    .limit(200)
}

export async function listFlaggedCodes(db: Database) {
  return db
    .select({ code: codes, ownerEmail: user.email })
    .from(codes)
    .innerJoin(user, eq(user.id, codes.userId))
    .where(
      and(eq(codes.riskStatus, 'flagged'), ne(codes.status, 'disabled'), isNull(codes.deletedAt)),
    )
    .orderBy(desc(codes.riskCheckedAt))
    .limit(200)
}

export async function searchCodes(db: Database, q: string) {
  const term = q.trim()
  if (!term) return []
  const like = `%${term.replace(/[%_\\]/g, (c) => '\\' + c)}%`
  const slug = term.replace(/^https?:\/\/[^/]+\//, '').replace(/\/$/, '')
  return db
    .select({ code: codes, ownerEmail: user.email })
    .from(codes)
    .innerJoin(user, eq(user.id, codes.userId))
    .where(
      and(
        isNull(codes.deletedAt),
        or(
          eq(codes.slug, slug),
          ilike(codes.destination, like),
          ilike(user.email, like),
          ilike(codes.name, like),
        ),
      ),
    )
    .orderBy(desc(codes.createdAt))
    .limit(100)
}

export async function searchUsers(db: Database, q: string) {
  const term = q.trim()
  const like = `%${term.replace(/[%_\\]/g, (c) => '\\' + c)}%`
  return db
    .select({
      id: user.id,
      email: user.email,
      createdAt: user.createdAt,
      suspendedAt: user.suspendedAt,
      role: user.role,
      plan: user.plan,
      codes: sql<number>`(select count(*)::int from codes where codes.user_id = ${user.id} and codes.deleted_at is null)`,
    })
    .from(user)
    .where(term ? ilike(user.email, like) : undefined)
    .orderBy(desc(user.createdAt))
    .limit(100)
}

export async function listAudit(db: Database, limit = 200) {
  return db
    .select()
    .from(auditLog)
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(limit)
}

export async function listBlocklist(db: Database) {
  return db.select().from(blocklist).orderBy(asc(blocklist.kind), asc(blocklist.value))
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
