import {
  and,
  count,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  notInArray,
  or,
  sql,
  studyCodes,
  studyPhotos,
  type Database,
} from '@qrfinity/db'
import { randomUUID } from 'node:crypto'
import {
  linkFacts,
  NOT_A_LINK_REASON,
  reasonFor,
  RECHECK_AFTER_MS,
  STUDY_CATEGORIES,
  summarizeStudy,
  UNREADABLE_REASON,
  type StudyCheck,
  type StudyEntry,
  type StudyOutcome,
} from '../study'
import { audit, type AdminContext } from './admin'
import { ServiceError } from './errors'
import { getFileStore } from './file-store'
import { checkLink } from './link-check'
import { likePattern, lower, paged, type ListOptions, type Orderable } from './listing'

/**
 * The dead QR codes study (/admin/study). The browser decodes each photo and sends only a
 * fingerprint of the content, its type and, for links, the address; this records each distinct
 * code once and follows its link with the QR code checker's own check.
 */

export type StudyInput = {
  /** SHA-256 of the decoded text, in hex; empty for a photo with no readable code. */
  fingerprint: string
  photoName: string
  /** 'url', 'wifi', 'vcard'…, or 'unreadable'. */
  contentType: string
  url: string | null
  category: string
  city: string
  country: string
  takenOn: string
  notes: string
}

export type StudyAdded = {
  photoName: string
  status: 'added' | 'seen-before'
  reason: string
}

type Row = typeof studyCodes.$inferSelect

const clean = (v: string, max: number) => v.trim().slice(0, max) || null

function checkInput(i: StudyInput) {
  if (!(STUDY_CATEGORIES as readonly string[]).includes(i.category))
    throw new ServiceError('Choose a category.', 'invalid')
  if (i.contentType !== 'unreadable' && !/^[0-9a-f]{64}$/.test(i.fingerprint))
    throw new ServiceError('That photo couldn’t be processed. Try again.', 'invalid')
  if (i.url !== null && (!/^https?:\/\//i.test(i.url) || i.url.length > 2000))
    throw new ServiceError('That code’s link couldn’t be read.', 'invalid')
  if (i.takenOn && !/^\d{4}-\d{2}-\d{2}$/.test(i.takenOn))
    throw new ServiceError('Enter the date as YYYY-MM-DD.', 'invalid')
}

/** Follows a study code's link and records the result as its latest check. */
async function checkEntry(db: Database, row: Pick<Row, 'id' | 'url' | 'checks'>) {
  if (!row.url) return
  const r = await checkLink(row.url)
  const check: StudyCheck = {
    outcome: r.outcome,
    reason: reasonFor(r),
    at: new Date().toISOString(),
  }
  await db
    .update(studyCodes)
    .set({
      outcome: check.outcome,
      reason: check.reason,
      finalUrl: 'finalUrl' in r ? r.finalUrl : null,
      httpStatus: 'status' in r ? r.status : null,
      checks: [...row.checks, check],
      lastCheckedAt: new Date(check.at),
    })
    .where(eq(studyCodes.id, row.id))
  return check
}

export type StudyPhoto = { bytes: Uint8Array; contentType: string }

const PHOTO_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024

/**
 * Adds one photo: records its code (a code photographed before is counted once more, not twice),
 * follows the link if the code is new, and keeps the photo in the private file store.
 */
export async function addStudyPhoto(
  ctx: AdminContext,
  i: StudyInput,
  photo: StudyPhoto | null,
): Promise<StudyAdded & { photoSaved: boolean }> {
  checkInput(i)
  if (photo && !PHOTO_TYPES[photo.contentType])
    throw new ServiceError('Photos must be JPG, PNG or WebP.', 'invalid')
  if (photo && photo.bytes.byteLength > MAX_PHOTO_BYTES)
    throw new ServiceError('That photo is too large (4 MB at most).', 'invalid')
  const unreadable = i.contentType === 'unreadable'
  const facts = i.url ? linkFacts(i.url) : { service: null, shortLink: false }
  const [row] = await ctx.db
    .insert(studyCodes)
    .values({
      fingerprint: unreadable ? `unreadable:${randomUUID()}` : i.fingerprint,
      photoName: clean(i.photoName, 200),
      category: i.category,
      city: clean(i.city, 100),
      country: clean(i.country, 60),
      takenOn: i.takenOn || null,
      notes: clean(i.notes, 500),
      contentType: clean(i.contentType, 30) ?? 'text',
      url: i.url,
      service: facts.service,
      shortLink: facts.shortLink,
      outcome: unreadable ? 'unreadable' : i.url ? null : 'not-a-link',
      reason: unreadable ? UNREADABLE_REASON : i.url ? null : NOT_A_LINK_REASON,
      createdBy: ctx.actor,
    })
    .onConflictDoUpdate({
      target: studyCodes.fingerprint,
      set: { timesSeen: sql`${studyCodes.timesSeen} + 1` },
    })
    .returning({
      id: studyCodes.id,
      url: studyCodes.url,
      checks: studyCodes.checks,
      reason: studyCodes.reason,
      inserted: sql<boolean>`(xmax = 0)`,
    })
  if (!row) throw new ServiceError('That photo couldn’t be saved.', 'invalid')

  let photoSaved = false
  const store = getFileStore()
  if (photo && store.configured) {
    const now = new Date()
    const key = `study/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}.${PHOTO_TYPES[photo.contentType]}`
    await store.put(key, photo.bytes, photo.contentType)
    await ctx.db.insert(studyPhotos).values({
      codeId: row.id,
      fileKey: key,
      photoName: clean(i.photoName, 200),
      bytes: photo.bytes.byteLength,
      createdBy: ctx.actor,
    })
    photoSaved = true
  }

  const check = row.inserted ? await checkEntry(ctx.db, row) : undefined
  await audit(ctx.db, ctx.actor, 'study.add', 'study', row.id, {
    seenBefore: !row.inserted,
    photoSaved,
  })
  return {
    photoName: i.photoName,
    status: row.inserted ? 'added' : 'seen-before',
    reason: check?.reason ?? row.reason ?? '',
    photoSaved,
  }
}

/** A study photo's bytes, for admins only (the route checks). */
export async function studyPhotoFile(db: Database, photoId: string) {
  const [p] = await db.select().from(studyPhotos).where(eq(studyPhotos.id, photoId))
  if (!p) return null
  return getFileStore().get(p.fileKey)
}

export async function photosFor(db: Database, codeIds: string[]) {
  if (!codeIds.length) return new Map<string, string[]>()
  const rows = await db
    .select({ id: studyPhotos.id, codeId: studyPhotos.codeId })
    .from(studyPhotos)
    .where(inArray(studyPhotos.codeId, codeIds))
    .orderBy(studyPhotos.createdAt)
  const m = new Map<string, string[]>()
  for (const r of rows) m.set(r.codeId, [...(m.get(r.codeId) ?? []), r.id])
  return m
}

/** Links due a check: never checked, or failed and last checked over a day ago. */
const dueWhere = () =>
  and(
    isNotNull(studyCodes.url),
    or(
      isNull(studyCodes.lastCheckedAt),
      and(
        notInArray(studyCodes.outcome, ['works', 'uncertain']),
        lte(studyCodes.lastCheckedAt, new Date(Date.now() - RECHECK_AFTER_MS)),
      ),
    ),
  )

/** Re-checks up to `limit` links that are due, and says how many are still waiting. */
export async function recheckStudy(ctx: AdminContext, limit = 8) {
  const due = await ctx.db
    .select({ id: studyCodes.id, url: studyCodes.url, checks: studyCodes.checks })
    .from(studyCodes)
    .where(dueWhere())
    .limit(limit)
  for (const row of due) await checkEntry(ctx.db, row)
  const [r] = await ctx.db.select({ n: count() }).from(studyCodes).where(dueWhere())
  if (due.length)
    await audit(ctx.db, ctx.actor, 'study.recheck', 'study', 'links', { checked: due.length })
  return { checked: due.length, remaining: r?.n ?? 0 }
}

/** Records the result of opening a link by hand (for sites that refuse automated checks). */
export async function setStudyResultByHand(ctx: AdminContext, id: string, works: boolean) {
  const [row] = await ctx.db.select().from(studyCodes).where(eq(studyCodes.id, id))
  if (!row?.url) throw new ServiceError('That code has no link to check.', 'not_found')
  const check: StudyCheck = {
    outcome: works ? 'works' : 'broken',
    reason: works ? 'Works (checked by hand)' : 'Doesn’t work (checked by hand)',
    at: new Date().toISOString(),
    manual: true,
  }
  await ctx.db
    .update(studyCodes)
    .set({
      outcome: check.outcome,
      reason: check.reason,
      checks: [...row.checks, check],
      lastCheckedAt: new Date(check.at),
    })
    .where(eq(studyCodes.id, id))
  await audit(ctx.db, ctx.actor, 'study.by-hand', 'study', id, { works })
}

/** Deletes a code, its photo records and the photo files. */
export async function deleteStudyEntry(ctx: AdminContext, id: string) {
  const photos = await ctx.db
    .select({ key: studyPhotos.fileKey })
    .from(studyPhotos)
    .where(eq(studyPhotos.codeId, id))
  const [row] = await ctx.db.delete(studyCodes).where(eq(studyCodes.id, id)).returning()
  const store = getFileStore()
  for (const p of photos) await store.remove(p.key)
  if (row) await audit(ctx.db, ctx.actor, 'study.delete', 'study', id, { photos: photos.length })
}

const toEntry = (r: Row): StudyEntry => ({
  category: r.category,
  type: r.contentType,
  url: r.url,
  service: r.service,
  shortLink: r.shortLink,
  outcome: r.outcome as StudyOutcome | null,
  reason: r.reason,
  checks: r.checks as StudyCheck[],
})

export async function loadStudySummary(db: Database) {
  const rows = await db.select().from(studyCodes)
  const photos = rows.reduce((n, r) => n + r.timesSeen, 0)
  const [due] = await db.select({ n: count() }).from(studyCodes).where(dueWhere())
  return { ...summarizeStudy(rows.map(toEntry)), photos, due: due?.n ?? 0 }
}

export type StudySort = 'added' | 'category' | 'result' | 'link' | 'checked'

const RESULT_FILTERS = {
  failing: and(isNotNull(studyCodes.url), ne(studyCodes.outcome, 'works')),
  'by-hand': eq(studyCodes.outcome, 'uncertain'),
} as const
export type StudyFilter = keyof typeof RESULT_FILTERS

export async function listStudy(
  db: Database,
  q = '',
  filter: string | undefined,
  opts: ListOptions = {},
) {
  const term = q.trim()
  const like = likePattern(term)
  const where = and(
    term
      ? or(
          ilike(studyCodes.url, like),
          ilike(studyCodes.city, like),
          ilike(studyCodes.notes, like),
          ilike(studyCodes.photoName, like),
          ilike(studyCodes.service, like),
        )
      : undefined,
    filter && filter in RESULT_FILTERS ? RESULT_FILTERS[filter as StudyFilter] : undefined,
  )
  return paged(opts, {
    sorts: {
      added: studyCodes.createdAt,
      category: studyCodes.category,
      result: lower(studyCodes.reason),
      link: lower(studyCodes.url),
      checked: studyCodes.lastCheckedAt,
    } satisfies Record<StudySort, Orderable>,
    defaultSort: 'added',
    defaultDir: 'desc',
    tiebreak: studyCodes.id,
    count: async () => {
      const [r] = await db.select({ n: count() }).from(studyCodes).where(where)
      return r?.n ?? 0
    },
    rows: (orderBy, limit, offset) =>
      db
        .select()
        .from(studyCodes)
        .where(where)
        .orderBy(...orderBy)
        .limit(limit)
        .offset(offset),
  })
}

function csvCell(value: unknown) {
  const s = String(value ?? '')
  // A leading = + - @ would run as a formula in a spreadsheet.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/** Every study code as CSV, for analysis and for the published data (after removing paths). */
export async function exportStudy(ctx: AdminContext) {
  const rows = await ctx.db.select().from(studyCodes).orderBy(studyCodes.createdAt)
  const head = [
    'category',
    'city',
    'country',
    'taken_on',
    'content_type',
    'url',
    'service',
    'short_link',
    'result',
    'reason',
    'http_status',
    'final_url',
    'checks',
    'first_checked',
    'last_checked',
    'times_seen',
    'photo',
    'notes',
  ]
  const lines = rows.map((r) =>
    [
      r.category,
      r.city,
      r.country,
      r.takenOn,
      r.contentType,
      r.url,
      r.service,
      r.shortLink,
      r.outcome,
      r.reason,
      r.httpStatus,
      r.finalUrl,
      r.checks.length,
      r.checks[0]?.at,
      r.checks.at(-1)?.at,
      r.timesSeen,
      r.photoName,
      r.notes,
    ]
      .map(csvCell)
      .join(','),
  )
  await audit(ctx.db, ctx.actor, 'study.export', 'study', 'all', { rows: rows.length })
  return '﻿' + [head.join(','), ...lines].join('\r\n') + '\r\n'
}
