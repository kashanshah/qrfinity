/**
 * Code service: every read and change to a user's codes goes through here, scoped to
 * that user. Changes that affect redirects bump the version, queue an outbox row in
 * the same transaction, then push to the edge; the cron retries anything left behind.
 */
import {
  checkCustomSlug,
  advancedCodeAllowance,
  isPlan,
  generateSlug,
  validateDestination,
  CONTENT_TYPES,
  DEFAULT_FIELDS,
  sanitizeDesign,
  type Design,
  type EdgeSync,
  type LinkRecord,
  type LinkStatus,
  type RateLimiter,
  type UrlReputation,
} from '@qrfinity/core'
import {
  codeTags,
  codes,
  destinationHistory,
  edgeSyncOutbox,
  folders,
  tags,
  user,
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

import { ServiceError } from './errors'
import { getFreeAdvancedCodeAllowance } from './settings'
import { LIMITS, rateKey, retryMessage } from './rate-limit'
import { screenForCode } from './screening'

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
    if (row.deletedAt || !row.destination) {
      await edge.remove(row.domain, row.slug)
    } else {
      const record: LinkRecord = {
        id: row.id,
        owner: row.userId,
        dest: row.destination,
        status: row.status,
        v: row.version,
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
  destination: string
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
  const destination = checkDestination(ctx, input.destination)
  if (input.folderId) await ownedFolder(ctx, input.folderId)
  await limit(ctx, 'create-hour', LIMITS.createPerHour)
  await limit(ctx, 'create-day', LIMITS.createPerDay)
  // After the rate limits, so spam can't spend the Web Risk quota.
  const custom = input.slug?.trim() ? await claimableCustomSlug(ctx, input.slug) : null
  const risk = await screenForCode(ctx.db, ctx.reputation, destination)

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
            destination,
            content: cleanContent(input.content),
            design: sanitizeDesign(input.design),
            folderId: input.folderId ?? null,
            customSlug: custom !== null,
            ...risk,
          })
          .returning()
        await tx.insert(destinationHistory).values({
          codeId: row!.id,
          oldDestination: null,
          newDestination: destination,
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

/**
 * Codes using advanced features, and how many the user's plan allows. A code counts once however
 * many advanced features it uses. Today that's custom short links; redirect rules and passwords
 * will count here too.
 */
export async function advancedCodeUsage(ctx: ServiceContext) {
  const [[owner], free, [row]] = await Promise.all([
    ctx.db.select({ plan: user.plan }).from(user).where(eq(user.id, ctx.userId)),
    getFreeAdvancedCodeAllowance(ctx.db),
    ctx.db
      .select({ used: sql<number>`count(*)::int` })
      .from(codes)
      .where(
        and(eq(codes.userId, ctx.userId), eq(codes.customSlug, true), isNull(codes.deletedAt)),
      ),
  ])
  const plan = isPlan(owner?.plan) ? owner.plan : 'free'
  return { used: row?.used ?? 0, allowance: advancedCodeAllowance(plan, free), plan }
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

export async function updateDestination(
  ctx: ServiceContext,
  id: string,
  input: { destination: string; content?: CodeContent | null },
) {
  const row = await ownedCode(ctx, id)
  if (row.kind !== 'dynamic')
    throw new ServiceError('Only dynamic codes can change destination.', 'invalid')
  if (row.status === 'disabled')
    throw new ServiceError(
      'This code was turned off for breaking our rules and can’t be edited.',
      'forbidden',
    )
  const destination = checkDestination(ctx, input.destination)
  if (destination === row.destination) {
    if (input.content !== undefined)
      await ctx.db
        .update(codes)
        .set({ content: cleanContent(input.content) })
        .where(eq(codes.id, id))
    return getCode(ctx, id)
  }
  await limit(ctx, 'edit-hour', LIMITS.editPerHour)
  const risk = await screenForCode(ctx.db, ctx.reputation, destination)
  await ctx.db.transaction(async (tx) => {
    const [updated] = await tx
      .update(codes)
      .set({
        ...risk,
        destination,
        content: input.content === undefined ? row.content : cleanContent(input.content),
        version: sql`${codes.version} + 1`,
      })
      .where(eq(codes.id, id))
      .returning({ version: codes.version })
    await tx.insert(destinationHistory).values({
      codeId: id,
      oldDestination: row.destination,
      newDestination: destination,
      changedBy: ctx.userId,
    })
    await enqueue(tx, id, updated!.version)
  })
  await syncCode(ctx.db, ctx.edge, id)
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
  await ownedCode(ctx, id)
  await ctx.db.transaction(async (tx) => {
    const [u] = await tx
      .update(codes)
      .set({ deletedAt: new Date(), version: sql`${codes.version} + 1` })
      .where(eq(codes.id, id))
      .returning({ version: codes.version })
    await enqueue(tx, id, u!.version)
  })
  await syncCode(ctx.db, ctx.edge, id)
}

export async function duplicateCode(ctx: ServiceContext, id: string) {
  const row = await ownedCode(ctx, id)
  if (row.kind !== 'dynamic' || !row.destination)
    throw new ServiceError('Only dynamic codes can be duplicated here.', 'invalid')
  const copy = await createDynamicCode(ctx, {
    name: `Copy of ${row.name}`.slice(0, NAME_MAX),
    destination: row.destination,
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
