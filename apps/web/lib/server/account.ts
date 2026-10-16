import {
  account,
  codes,
  edgeSyncOutbox,
  eq,
  folders,
  isNull,
  session,
  sql,
  tags,
  user,
  and,
} from '@qrfinity/db'
import { audit } from './admin'
import { syncCode, type ServiceContext } from './codes'

/**
 * Deletes the signed-in user's account. Personal data is removed; the code rows stay as
 * tombstones (marked deleted) so their short links are never handed to someone else.
 * Deleted codes stop redirecting: printed copies show "not active".
 */
export async function deleteAccount(ctx: ServiceContext) {
  const ids = await ctx.db.transaction(async (tx) => {
    const live = await tx
      .update(codes)
      .set({
        deletedAt: new Date(),
        version: sql`${codes.version} + 1`,
        name: 'Deleted',
        content: null,
        folderId: null,
      })
      .where(and(eq(codes.userId, ctx.userId), isNull(codes.deletedAt)))
      .returning({ id: codes.id, version: codes.version })
    for (const c of live) {
      await tx
        .insert(edgeSyncOutbox)
        .values({ codeId: c.id, version: c.version })
        .onConflictDoUpdate({
          target: edgeSyncOutbox.codeId,
          set: { version: sql`greatest(${edgeSyncOutbox.version}, ${c.version})` },
        })
    }
    await tx.delete(session).where(eq(session.userId, ctx.userId))
    await tx.delete(account).where(eq(account.userId, ctx.userId))
    await tx.delete(tags).where(eq(tags.userId, ctx.userId))
    await tx.delete(folders).where(eq(folders.userId, ctx.userId))
    await tx
      .update(user)
      .set({
        email: `deleted-${ctx.userId}@deleted.invalid`,
        name: '',
        image: null,
        emailVerified: false,
      })
      .where(eq(user.id, ctx.userId))
    return live.map((c) => c.id)
  })
  for (const id of ids) await syncCode(ctx.db, ctx.edge, id)
  await audit(ctx.db, ctx.userId, 'account.delete', 'user', ctx.userId, { codes: ids.length })
}
