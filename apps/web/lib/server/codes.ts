/**
 * Code service: every read and change to a user's codes goes through here, scoped to
 * that user. Changes that affect redirects bump the version, queue an outbox row in
 * the same transaction, then push to the edge; the cron retries anything left behind.
 */
import {
  checkCustomSlug,
  advancedCodeAllowance,
  generateSlug,
  validateDestination,
  validateRules,
  cleanVcardFields,
  encodeContent,
  isPageType,
  pageSummary,
  pageWebsite,
  CONTENT_TYPES,
  DEFAULT_FIELDS,
  sanitizeDesign,
  type Design,
  type EdgeSync,
  type HostedPage,
  type LinkRecord,
  type LinkStatus,
  type RateLimiter,
  type RedirectRule,
  type UrlReputation,
} from '@qrfinity/core'
import {
  codeTags,
  codes,
  destinationHistory,
  edgeSyncOutbox,
  folders,
  tags,
  type CodeContent,
  type Database,
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  lt,
  or,
  sql,
} from '@qrfinity/db'

import { audit } from './admin'
import { ServiceError } from './errors'
import { effectivePlanFor } from './plan'
import { getFreeAdvancedCodeAllowance } from './settings'
import { LIMITS, rateKey, retryMessage } from './rate-limit'
import { nextRiskCheck, screenForCode, type RiskFields } from './screening'

export { ServiceError }

export type ServiceContext = {
  db: Database
  edge: EdgeSync
  limiter: RateLimiter
  reputation: UrlReputation
  userId: string
  shortDomain: string
  rateSecret: string
}

type CodeRow = typeof codes.$inferSelect
export type CodeView = CodeRow & { tags: string[]; folderName: string | null }

const NAME_MAX = 80

/** Keeps only known fields of a known content type, with string or boolean values. */
function cleanContent(input: unknown): CodeContent | null {
  if (!input || typeof input !== 'object') return null
  const { type, fields } = input as { type?: unknown; fields?: unknown }
  if (!CONTENT_TYPES.includes(type as never) || !fields || typeof fields !== 'object') return null
  const defaults = DEFAULT_FIELDS[type as keyof typeof DEFAULT_FIELDS] as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const [k, def] of Object.entries(defaults)) {
    const v = (fields as Record<string, unknown>)[k]
    out[k] = typeof v === typeof def ? (typeof v === 'string' ? v.slice(0, 2000) : v) : def
  }
  return { type, fields: out } as CodeContent
}

function cleanName(name: string): string {
  const n = name.trim().slice(0, NAME_MAX)
  if (!n) throw new ServiceError('Give the code a name.', 'invalid')
  return n
}

function checkDestination(ctx: ServiceContext, input: string): string {
  const r = validateDestination(input, [ctx.shortDomain])
  if (!r.ok) throw new ServiceError(r.message, 'invalid')
  return r.url
}

/** What a dynamic code opens: a destination to redirect to, or a hosted page (a contact card). */
type Target = { destination: string; page: null } | { destination: null; page: HostedPage }

function resolveTarget(
  ctx: ServiceContext,
  input: { destination?: string; content?: CodeContent | null },
): Target {
  if (input.content && isPageType(input.content.type)) {
    const fields = cleanVcardFields(input.content.fields)
    const r = encodeContent('vcard', fields)
    if (!r.ok)
      throw new ServiceError(
        r.reason === 'empty'
          ? 'Add a name or an organisation for the contact card.'
          : (Object.values(r.errors)[0] ?? 'Check the contact details.'),
        'invalid',
      )
    // The website is a link on our domain's page: same checks as a destination.
    if (fields.website.trim()) checkDestination(ctx, fields.website)
    return { destination: null, page: { type: 'vcard', fields } }
  }
  return { destination: checkDestination(ctx, input.destination ?? ''), page: null }
}

const targetSummary = (t: Target) => t.destination ?? pageSummary(t.page)

/** Screens what a scan can reach: the destination, or the contact card's website. */
async function screenTarget(ctx: ServiceContext, t: Target): Promise<RiskFields> {
  const url = t.destination ?? pageWebsite(t.page)
  if (url) return screenForCode(ctx.db, ctx.reputation, url)
  const now = new Date()
  return {
    riskStatus: 'clean',
    riskDetail: null,
    riskCheckedAt: now,
    riskChecks: 1,
    nextRiskCheckAt: nextRiskCheck(1, now),
  }
}

/** The hosted page a stored code serves, if it's a contact card code. */
export function pageOf(row: Pick<CodeRow, 'destination' | 'content'>): HostedPage | null {
  if (row.destination || !row.content || !isPageType(row.content.type)) return null
  return { type: 'vcard', fields: cleanVcardFields(row.content.fields) }
}

async function limit(ctx: ServiceContext, action: string, cfg: { limit: number; window: number }) {
  const r = await ctx.limiter.hit(
    await rateKey(ctx.rateSecret, action, ctx.userId),
    cfg.limit,
    cfg.window,
  )
  if (!r.ok) throw new ServiceError(retryMessage(r.retryAfterSeconds), 'rate_limited')
}

async function ownedCode(ctx: ServiceContext, id: string): Promise<CodeRow> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ServiceError('That code doesn’t exist.', 'not_found')
  const [row] = await ctx.db
    .select()
    .from(codes)
    .where(and(eq(codes.id, id), eq(codes.userId, ctx.userId), isNull(codes.deletedAt)))
  if (!row) throw new ServiceError('That code doesn’t exist.', 'not_found')
  return row
}

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]

async function enqueue(tx: Tx, codeId: string, version: number) {
  await tx
    .insert(edgeSyncOutbox)
    .values({ codeId, version })
    .onConflictDoUpdate({
      target: edgeSyncOutbox.codeId,
      set: { version: sql`greatest(${edgeSyncOutbox.version}, ${version})` },
    })
}

/** Pushes a code's current state to the edge and clears its outbox row. Safe to call repeatedly. */
export async function syncCode(db: Database, edge: EdgeSync, codeId: string): Promise<boolean> {
  const [row] = await db.select().from(codes).where(eq(codes.id, codeId))
  if (!row || row.kind !== 'dynamic' || !row.domain || !row.slug) {
    await db.delete(edgeSyncOutbox).where(eq(edgeSyncOutbox.codeId, codeId))
    return true
  }
  try {
    const page = pageOf(row)
    if (row.deletedAt || (!row.destination && !page)) {
      await edge.remove(row.domain, row.slug)
    } else {
      const record: LinkRecord = {
        id: row.id,
        owner: row.userId,
        dest: row.destination ?? '',
        status: row.status,
        v: row.version,
        // Paused rules (beyond the owner's allowance) aren't sent: scans use the destination.
        ...(row.rules?.length && !row.advancedPaused && !page ? { rules: row.rules } : {}),
        ...(page ? { page } : {}),
      }
      await edge.put(row.domain, row.slug, record)
    }
    // Only clear the row if no newer change was queued meanwhile.
    await db
      .delete(edgeSyncOutbox)
      .where(
        and(eq(edgeSyncOutbox.codeId, codeId), sql`${edgeSyncOutbox.version} <= ${row.version}`),
      )
    return true
  } catch (error) {
    await db
      .update(edgeSyncOutbox)
      .set({
        attempts: sql`${edgeSyncOutbox.attempts} + 1`,
        lastError: String(error).slice(0, 500),
      })
      .where(eq(edgeSyncOutbox.codeId, codeId))
    return false
  }
}

/** Retries queued edge updates (run by the cron). */
export async function processOutbox(db: Database, edge: EdgeSync, max = 100) {
  const rows = await db
    .select({ codeId: edgeSyncOutbox.codeId })
    .from(edgeSyncOutbox)
    .where(lt(edgeSyncOutbox.createdAt, sql`now() - interval '20 seconds'`))
    .orderBy(asc(edgeSyncOutbox.createdAt))
    .limit(max)
  let synced = 0
  for (const r of rows) if (await syncCode(db, edge, r.codeId)) synced++
  return { attempted: rows.length, synced }
}

// ---------------------------------------------------------------------------
// Reads

export async function listCodes(
  ctx: ServiceContext,
  filter: { q?: string; folderId?: string | null; tag?: string } = {},
): Promise<CodeView[]> {
  const conds = [eq(codes.userId, ctx.userId), isNull(codes.deletedAt)]
  const q = filter.q?.trim()
  if (q) {
    const like = `%${q.replace(/[%_\\]/g, (c) => '\\' + c)}%`
    conds.push(
      or(ilike(codes.name, like), ilike(codes.destination, like), ilike(codes.slug, like))!,
    )
  }
  if (filter.folderId) conds.push(eq(codes.folderId, filter.folderId))
  if (filter.tag) {
    conds.push(
      inArray(
        codes.id,
        ctx.db
          .select({ id: codeTags.codeId })
          .from(codeTags)
          .innerJoin(tags, eq(tags.id, codeTags.tagId))
          .where(and(eq(tags.userId, ctx.userId), eq(tags.name, filter.tag))),
      ),
    )
  }
  const rows = await ctx.db
    .select({ code: codes, folderName: folders.name })
    .from(codes)
    .leftJoin(folders, eq(folders.id, codes.folderId))
    .where(and(...conds))
    .orderBy(desc(codes.createdAt))
    .limit(1000)
  return attachTags(
    ctx,
    rows.map((r) => ({ ...r.code, folderName: r.folderName })),
  )
}

async function attachTags(
  ctx: ServiceContext,
  rows: (CodeRow & { folderName: string | null })[],
): Promise<CodeView[]> {
  if (!rows.length) return []
  const tagRows = await ctx.db
    .select({ codeId: codeTags.codeId, name: tags.name })
    .from(codeTags)
    .innerJoin(tags, eq(tags.id, codeTags.tagId))
    .where(
      inArray(
        codeTags.codeId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(tags.name))
  const byCode = new Map<string, string[]>()
  for (const t of tagRows) byCode.set(t.codeId, [...(byCode.get(t.codeId) ?? []), t.name])
  return rows.map((r) => ({ ...r, tags: byCode.get(r.id) ?? [] }))
}

export async function getCode(ctx: ServiceContext, id: string): Promise<CodeView> {
  const row = await ownedCode(ctx, id)
  const folder = row.folderId
    ? (
        await ctx.db
          .select({ name: folders.name })
          .from(folders)
          .where(eq(folders.id, row.folderId))
      )[0]
    : undefined
  const [view] = await attachTags(ctx, [{ ...row, folderName: folder?.name ?? null }])
  return view!
}

export async function destinationHistoryFor(ctx: ServiceContext, id: string) {
  await ownedCode(ctx, id)
  return ctx.db
    .select()
    .from(destinationHistory)
    .where(eq(destinationHistory.codeId, id))
    .orderBy(desc(destinationHistory.changedAt), desc(destinationHistory.id))
    .limit(200)
}

// ---------------------------------------------------------------------------
// Changes

export type CreateDynamicInput = {
  name: string
  /** Where scans go. Leave out for a contact card (`content` of type vcard). */
  destination?: string
  content?: CodeContent | null
  design: Design
  folderId?: string | null
  /** Optional custom short link, e.g. "joes-menu". Fixed once created. */
  slug?: string | null
}

export async function createDynamicCode(
  ctx: ServiceContext,
  input: CreateDynamicInput,
): Promise<CodeView> {
  const name = cleanName(input.name)
  const target = resolveTarget(ctx, input)
  if (input.folderId) await ownedFolder(ctx, input.folderId)
  await limit(ctx, 'create-hour', LIMITS.createPerHour)
  await limit(ctx, 'create-day', LIMITS.createPerDay)
  // After the rate limits, so spam can't spend the Web Risk quota.
  const custom = input.slug?.trim() ? await claimableCustomSlug(ctx, input.slug) : null
  const risk = await screenTarget(ctx, target)

  for (let attempt = 0; attempt < 6; attempt++) {
    const slug = custom ?? generateSlug()
    try {
      const created = await ctx.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(codes)
          .values({
            userId: ctx.userId,
            kind: 'dynamic',
            name,
            domain: ctx.shortDomain,
            slug,
            destination: target.destination,
            content: target.page ?? cleanContent(input.content),
            design: sanitizeDesign(input.design),
            folderId: input.folderId ?? null,
            customSlug: custom !== null,
            ...risk,
          })
          .returning()
        await tx.insert(destinationHistory).values({
          codeId: row!.id,
          oldDestination: null,
          newDestination: targetSummary(target),
          changedBy: ctx.userId,
        })
        await enqueue(tx, row!.id, row!.version)
        return row!
      })
      await syncCode(ctx.db, ctx.edge, created.id)
      return getCode(ctx, created.id)
    } catch (error) {
      // Unique violation on (domain, slug): try another slug, or tell the owner theirs is taken.
      if (
        (error as { code?: string; cause?: { code?: string } }).code === '23505' ||
        (error as { cause?: { code?: string } }).cause?.code === '23505'
      ) {
        if (custom) throw new ServiceError('That short link is taken. Try another.', 'invalid')
        continue
      }
      throw error
    }
  }
  throw new Error('Could not allocate a unique short link')
}

/** A live code that uses at least one advanced feature (custom short link or redirect rules). */
const usesAdvanced = sql`(${codes.customSlug} or ${codes.rules} is not null)`

/**
 * Codes using advanced features, and how many the user's plan allows. A code counts once however
 * many advanced features it uses: custom short links and redirect rules today, passwords later.
 */
export async function advancedCodeUsage(ctx: Pick<ServiceContext, 'db' | 'userId'>) {
  const [plan, free, [row]] = await Promise.all([
    effectivePlanFor(ctx.db, ctx.userId),
    getFreeAdvancedCodeAllowance(ctx.db),
    ctx.db
      .select({ used: sql<number>`count(*)::int` })
      .from(codes)
      .where(and(eq(codes.userId, ctx.userId), usesAdvanced, isNull(codes.deletedAt))),
  ])
  return { used: row?.used ?? 0, allowance: advancedCodeAllowance(plan, free), plan }
}

/**
 * Applies the allowance to a user's codes: the oldest codes with advanced features, up to the
 * allowance, keep them; the rest are paused (rules stop applying, short links keep working).
 * Run whenever the allowance can change: plan or subscription changes, the admin setting, deletes.
 * Returns how many codes changed. Pass `edge` to push them now; otherwise the outbox cron does.
 */
export async function refreshAdvancedFeatures(db: Database, userId: string, edge?: EdgeSync) {
  const { allowance } = await advancedCodeUsage({ db, userId })
  const list = await db
    .select({ id: codes.id, paused: codes.advancedPaused, rules: codes.rules })
    .from(codes)
    .where(and(eq(codes.userId, userId), usesAdvanced, isNull(codes.deletedAt)))
    .orderBy(asc(codes.createdAt), asc(codes.id))
  const changed = list
    .map((c, i) => ({ ...c, shouldPause: i >= allowance }))
    .filter((c) => c.paused !== c.shouldPause)
  for (const c of changed) {
    await db.transaction(async (tx) => {
      const [u] = await tx
        .update(codes)
        .set({
          advancedPaused: c.shouldPause,
          // Only codes with rules redirect differently; the others just need the flag.
          ...(c.rules ? { version: sql`${codes.version} + 1` } : {}),
        })
        .where(eq(codes.id, c.id))
        .returning({ version: codes.version })
      if (c.rules) await enqueue(tx, c.id, u!.version)
    })
    if (edge && c.rules) await syncCode(db, edge, c.id)
  }
  if (changed.length)
    await audit(db, 'system', 'code.advanced', 'user', userId, {
      paused: changed.filter((c) => c.shouldPause).length,
      resumed: changed.filter((c) => !c.shouldPause).length,
    })
  return changed.length
}

/** Every user with codes using advanced features (after the admin changes the free allowance). */
export async function refreshAdvancedFeaturesForAll(db: Database, edge?: EdgeSync) {
  const owners = await db
    .selectDistinct({ userId: codes.userId })
    .from(codes)
    .where(and(usesAdvanced, isNull(codes.deletedAt)))
  let changed = 0
  for (const o of owners) changed += await refreshAdvancedFeatures(db, o.userId, edge)
  return changed
}

async function claimableCustomSlug(ctx: ServiceContext, requested: string): Promise<string> {
  const check = checkCustomSlug(requested)
  if (!check.ok) throw new ServiceError(check.error, 'invalid')
  const { used, allowance } = await advancedCodeUsage(ctx)
  if (used >= allowance)
    throw new ServiceError(
      allowance === 0
        ? 'Advanced features aren’t available on your account. Leave the short link empty to get a random one.'
        : `You’re using advanced features on ${used} of ${allowance} ${allowance === 1 ? 'code' : 'codes'}. Leave the short link empty to get a random one, or choose a plan for more.`,
      'invalid',
    )
  // Taken includes deleted codes: a printed short link is never handed to someone else.
  const [taken] = await ctx.db
    .select({ id: codes.id })
    .from(codes)
    .where(and(eq(codes.domain, ctx.shortDomain), eq(codes.slug, check.slug)))
  if (taken) throw new ServiceError('That short link is taken. Try another.', 'invalid')
  return check.slug
}

/**
 * Changes what a dynamic code opens: a new destination, or new contact card details (or a switch
 * between the two). The printed code stays the same.
 */
export async function updateDestination(
  ctx: ServiceContext,
  id: string,
  input: { destination?: string; content?: CodeContent | null },
) {
  const row = await ownedCode(ctx, id)
  if (row.kind !== 'dynamic')
    throw new ServiceError('Only dynamic codes can change destination.', 'invalid')
  if (row.status === 'disabled')
    throw new ServiceError(
      'This code was turned off for breaking our rules and can’t be edited.',
      'forbidden',
    )
  const next = resolveTarget(ctx, input)
  const before = pageOf(row)
  const content =
    next.page ?? (input.content === undefined ? row.content : cleanContent(input.content))
  const unchanged = next.page
    ? before !== null && JSON.stringify(before.fields) === JSON.stringify(next.page.fields)
    : next.destination === row.destination
  if (unchanged) {
    if (!next.page && input.content !== undefined)
      await ctx.db.update(codes).set({ content }).where(eq(codes.id, id))
    return getCode(ctx, id)
  }
  if (next.page && row.rules)
    throw new ServiceError(
      'Remove this code’s redirect rules before turning it into a contact card.',
      'invalid',
    )
  await limit(ctx, 'edit-hour', LIMITS.editPerHour)
  const risk = await screenTarget(ctx, next)
  await ctx.db.transaction(async (tx) => {
    const [updated] = await tx
      .update(codes)
      .set({
        ...risk,
        destination: next.destination,
        content,
        version: sql`${codes.version} + 1`,
      })
      .where(eq(codes.id, id))
      .returning({ version: codes.version })
    await tx.insert(destinationHistory).values({
      codeId: id,
      oldDestination: row.destination ?? (before ? pageSummary(before) : null),
      newDestination: targetSummary(next),
      changedBy: ctx.userId,
    })
    await enqueue(tx, id, updated!.version)
  })
  await syncCode(ctx.db, ctx.edge, id)
  return getCode(ctx, id)
}

/**
 * Replaces a code's redirect rules (an advanced feature). An empty list removes them. New rule
 * destinations are screened like the main destination; the re-check cron covers them afterwards.
 */
export async function setRules(ctx: ServiceContext, id: string, input: unknown) {
  const row = await ownedCode(ctx, id)
  if (row.kind !== 'dynamic')
    throw new ServiceError('Only dynamic codes can have redirect rules.', 'invalid')
  if (!row.destination)
    throw new ServiceError(
      'Redirect rules work on codes that open a link. A contact card always shows its page.',
      'invalid',
    )
  if (row.status === 'disabled')
    throw new ServiceError(
      'This code was turned off for breaking our rules and can’t be edited.',
      'forbidden',
    )
  const parsed = validateRules(input, (url) => {
    const r = validateDestination(url, [ctx.shortDomain])
    return r.ok ? { ok: true, url: r.url } : { ok: false, message: r.message }
  })
  if (!parsed.ok) throw new ServiceError(parsed.error, 'invalid')
  const rules: RedirectRule[] | null = parsed.rules.length ? parsed.rules : null

  if (rules && !row.rules && !row.customSlug) {
    // Adding the code's first advanced feature takes one place in the allowance.
    const { used, allowance } = await advancedCodeUsage(ctx)
    if (used >= allowance)
      throw new ServiceError(
        `You’re using advanced features on ${used} of ${allowance} ${allowance === 1 ? 'code' : 'codes'}. Choose a plan to add redirect rules to more codes.`,
        'invalid',
      )
  } else if (rules && row.advancedPaused) {
    throw new ServiceError(
      'Advanced features on this code are paused because your plan covers fewer codes. Choose a plan to change its rules, or remove them.',
      'invalid',
    )
  }

  await limit(ctx, 'edit-hour', LIMITS.editPerHour)
  // Screen only destinations that weren't already there, so re-saving doesn't spend lookups.
  const known = new Set([row.destination, ...(row.rules ?? []).map((r) => r.dest)])
  let recheckSoon = false
  for (const dest of new Set((rules ?? []).map((r) => r.dest))) {
    if (known.has(dest)) continue
    const risk = await screenForCode(ctx.db, ctx.reputation, dest)
    if (risk.riskStatus === 'unchecked') recheckSoon = true
  }

  await ctx.db.transaction(async (tx) => {
    const [u] = await tx
      .update(codes)
      .set({
        rules,
        version: sql`${codes.version} + 1`,
        ...(recheckSoon ? { nextRiskCheckAt: new Date(Date.now() + 3_600_000) } : {}),
      })
      .where(eq(codes.id, id))
      .returning({ version: codes.version })
    await enqueue(tx, id, u!.version)
  })
  await syncCode(ctx.db, ctx.edge, id)
  // Removing the last advanced feature frees a place: a paused code may get its features back.
  if (!rules && row.rules && !row.customSlug)
    await refreshAdvancedFeatures(ctx.db, ctx.userId, ctx.edge)
  return getCode(ctx, id)
}

export async function updateDetails(
  ctx: ServiceContext,
  id: string,
  input: { name?: string; design?: Design; folderId?: string | null },
) {
  await ownedCode(ctx, id)
  if (input.folderId) await ownedFolder(ctx, input.folderId)
  await limit(ctx, 'edit-hour', LIMITS.editPerHour)
  await ctx.db
    .update(codes)
    .set({
      ...(input.name !== undefined ? { name: cleanName(input.name) } : {}),
      ...(input.design !== undefined ? { design: sanitizeDesign(input.design) } : {}),
      ...(input.folderId !== undefined ? { folderId: input.folderId } : {}),
    })
    .where(eq(codes.id, id))
  return getCode(ctx, id)
}

/** Owner-initiated pause and resume. The only way a code stops redirecting without an admin. */
export async function setPaused(ctx: ServiceContext, id: string, paused: boolean) {
  const row = await ownedCode(ctx, id)
  if (row.status === 'disabled')
    throw new ServiceError('This code was turned off for breaking our rules.', 'forbidden')
  const status: LinkStatus = paused ? 'paused' : 'active'
  if (row.status === status) return getCode(ctx, id)
  await limit(ctx, 'edit-hour', LIMITS.editPerHour)
  await ctx.db.transaction(async (tx) => {
    const [u] = await tx
      .update(codes)
      .set({ status, version: sql`${codes.version} + 1` })
      .where(eq(codes.id, id))
      .returning({ version: codes.version })
    await enqueue(tx, id, u!.version)
  })
  await syncCode(ctx.db, ctx.edge, id)
  return getCode(ctx, id)
}

/** Deletes a code (owner action). The slug is kept reserved and never handed out again. */
export async function deleteCode(ctx: ServiceContext, id: string) {
  const row = await ownedCode(ctx, id)
  await ctx.db.transaction(async (tx) => {
    const [u] = await tx
      .update(codes)
      .set({ deletedAt: new Date(), version: sql`${codes.version} + 1` })
      .where(eq(codes.id, id))
      .returning({ version: codes.version })
    await enqueue(tx, id, u!.version)
  })
  await syncCode(ctx.db, ctx.edge, id)
  // A deleted code no longer counts, so a paused one may get its advanced features back.
  if (row.customSlug || row.rules) await refreshAdvancedFeatures(ctx.db, ctx.userId, ctx.edge)
}

export async function duplicateCode(ctx: ServiceContext, id: string) {
  const row = await ownedCode(ctx, id)
  if (row.kind !== 'dynamic' || (!row.destination && !pageOf(row)))
    throw new ServiceError('Only dynamic codes can be duplicated here.', 'invalid')
  const copy = await createDynamicCode(ctx, {
    name: `Copy of ${row.name}`.slice(0, NAME_MAX),
    destination: row.destination ?? undefined,
    content: row.content,
    design: row.design,
    folderId: row.folderId,
  })
  const names = (await getCode(ctx, id)).tags
  if (names.length) await setCodeTags(ctx, copy.id, names)
  return getCode(ctx, copy.id)
}

// ---------------------------------------------------------------------------
// Folders and tags

async function ownedFolder(ctx: ServiceContext, id: string) {
  const [f] = await ctx.db
    .select()
    .from(folders)
    .where(and(eq(folders.id, id), eq(folders.userId, ctx.userId)))
  if (!f) throw new ServiceError('That folder doesn’t exist.', 'not_found')
  return f
}

export function listFolders(ctx: ServiceContext) {
  return ctx.db
    .select()
    .from(folders)
    .where(eq(folders.userId, ctx.userId))
    .orderBy(asc(folders.name))
}

export async function createFolder(ctx: ServiceContext, name: string) {
  const n = name.trim().slice(0, 60)
  if (!n) throw new ServiceError('Give the folder a name.', 'invalid')
  const [f] = await ctx.db
    .insert(folders)
    .values({ userId: ctx.userId, name: n })
    .onConflictDoNothing()
    .returning()
  if (!f) throw new ServiceError('You already have a folder with that name.', 'invalid')
  return f
}

export async function renameFolder(ctx: ServiceContext, id: string, name: string) {
  await ownedFolder(ctx, id)
  const n = name.trim().slice(0, 60)
  if (!n) throw new ServiceError('Give the folder a name.', 'invalid')
  try {
    await ctx.db.update(folders).set({ name: n }).where(eq(folders.id, id))
  } catch {
    throw new ServiceError('You already have a folder with that name.', 'invalid')
  }
}

/** Deleting a folder keeps its codes; they just leave the folder. */
export async function deleteFolder(ctx: ServiceContext, id: string) {
  await ownedFolder(ctx, id)
  await ctx.db.delete(folders).where(eq(folders.id, id))
}

export async function listTags(ctx: ServiceContext) {
  return ctx.db.select().from(tags).where(eq(tags.userId, ctx.userId)).orderBy(asc(tags.name))
}

export async function setCodeTags(ctx: ServiceContext, codeId: string, names: string[]) {
  await ownedCode(ctx, codeId)
  const clean = [
    ...new Set(names.map((n) => n.trim().toLowerCase().slice(0, 30)).filter(Boolean)),
  ].slice(0, 20)
  await ctx.db.transaction(async (tx) => {
    if (clean.length) {
      await tx
        .insert(tags)
        .values(clean.map((name) => ({ userId: ctx.userId, name })))
        .onConflictDoNothing()
    }
    const ids = clean.length
      ? await tx
          .select({ id: tags.id })
          .from(tags)
          .where(and(eq(tags.userId, ctx.userId), inArray(tags.name, clean)))
      : []
    await tx.delete(codeTags).where(eq(codeTags.codeId, codeId))
    if (ids.length) await tx.insert(codeTags).values(ids.map((t) => ({ codeId, tagId: t.id })))
    // Drop tags no code uses any more.
    await tx.execute(
      sql`delete from tags where user_id = ${ctx.userId} and not exists (select 1 from code_tags where code_tags.tag_id = tags.id)`,
    )
  })
  return getCode(ctx, codeId)
}

// ---------------------------------------------------------------------------
// Export

export async function exportAll(ctx: ServiceContext) {
  const list = await listCodes(ctx)
  const history = list.length
    ? await ctx.db
        .select()
        .from(destinationHistory)
        .where(
          inArray(
            destinationHistory.codeId,
            list.map((c) => c.id),
          ),
        )
        .orderBy(asc(destinationHistory.changedAt))
    : []
  return list.map((c) => ({
    id: c.id,
    name: c.name,
    kind: c.kind,
    short_link: c.domain && c.slug ? `https://${c.domain}/${c.slug}` : null,
    destination: c.destination,
    status: c.status,
    folder: c.folderName,
    tags: c.tags,
    content: c.content,
    design: c.design,
    created_at: c.createdAt.toISOString(),
    updated_at: c.updatedAt.toISOString(),
    destination_history: history
      .filter((h) => h.codeId === c.id)
      .map((h) => ({
        from: h.oldDestination,
        to: h.newDestination,
        changed_at: h.changedAt.toISOString(),
      })),
  }))
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : Array.isArray(v) ? v.join('; ') : String(v)
  // Neutralise spreadsheet formulas and quote everything.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  return `"${safe.replace(/"/g, '""')}"`
}

export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  return (
    [
      columns.map(csvCell).join(','),
      ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(',')),
    ].join('\r\n') + '\r\n'
  )
}

export const CODE_CSV_COLUMNS = [
  'id',
  'name',
  'kind',
  'short_link',
  'destination',
  'status',
  'folder',
  'tags',
  'created_at',
  'updated_at',
]
