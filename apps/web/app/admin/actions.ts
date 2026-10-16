'use server'

import { revalidatePath } from 'next/cache'
import {
  addBlock,
  audit,
  clearFlag,
  disableCode,
  removeBlock,
  resolveReport,
  restoreCode,
  suspendUser,
  unsuspendUser,
  type AdminContext,
} from '@/lib/server/admin'
import { adminContext } from '@/lib/server/context'
import { pagesToSubmit, submitToIndexNow } from '@/lib/server/indexnow'
import { setFlag, setUserPlan } from '@/lib/server/entitlements'
import { setCloudflarePlan, setFreeCustomSlugAllowance } from '@/lib/server/settings'
import { ServiceError } from '@/lib/server/errors'

type Result = { ok: true } | { ok: false; error: string }

async function run(fn: (ctx: AdminContext) => Promise<unknown>): Promise<Result> {
  const ctx = await adminContext()
  try {
    await fn(ctx)
    revalidatePath('/admin', 'layout')
    return { ok: true }
  } catch (e) {
    if (e instanceof ServiceError) return { ok: false, error: e.message }
    console.error(e)
    return { ok: false, error: 'That didn’t work. Check the logs.' }
  }
}

export const disableCodeAction = async (id: string, reason: string) =>
  run((c) => disableCode(c, id, reason))
export const restoreCodeAction = async (id: string) => run((c) => restoreCode(c, id))
export const clearFlagAction = async (id: string) => run((c) => clearFlag(c, id))
export const dismissReportAction = async (id: string) =>
  run((c) => resolveReport(c, id, 'dismissed'))
export const suspendUserAction = async (id: string, reason: string) =>
  run((c) => suspendUser(c, id, reason))
export const unsuspendUserAction = async (id: string) => run((c) => unsuspendUser(c, id))
export const addBlockAction = async (kind: string, value: string, reason: string) =>
  run((c) => addBlock(c, kind, value, reason))
export const removeBlockAction = async (id: string) => run((c) => removeBlock(c, id))
export const setUserPlanAction = async (id: string, plan: string) =>
  run((c) => setUserPlan(c, id, plan))
export const setFlagAction = async (key: string, enabled: boolean, emails: string[]) =>
  run((c) => setFlag(c, key, { enabled, emails }))
export const setFreeCustomSlugsAction = async (value: number) =>
  run((c) => setFreeCustomSlugAllowance(c, value))

/** Admin → Settings: send pages to IndexNow now. Returns a sentence for the page. */
export async function submitIndexNowAction(
  all: boolean,
): Promise<{ ok: boolean; message: string }> {
  const ctx = await adminContext()
  const urls = pagesToSubmit(all)
  if (!urls.length)
    return { ok: true, message: 'No pages changed in the last two days, so nothing was sent.' }
  try {
    const r = await submitToIndexNow(urls)
    await audit(ctx.db, ctx.actor, 'indexnow.submit', 'site', all ? 'all' : 'changed', { ...r })
    if (r.skipped) return { ok: false, message: r.skipped }
    if (r.status === 200 || r.status === 202)
      return {
        ok: true,
        message: `Sent ${r.submitted} pages. IndexNow accepted them (${r.status}).`,
      }
    const why: Record<number, string> = {
      400: 'the request was malformed',
      403: 'the key file at /indexnow-key.txt doesn’t match INDEXNOW_KEY (redeploy after setting it)',
      422: 'some URLs don’t belong to qrfinity.com',
      429: 'too many submissions; try again later',
    }
    return {
      ok: false,
      message: `IndexNow refused it (${r.status}): ${why[r.status ?? 0] ?? 'unexpected response'}.`,
    }
  } catch (e) {
    console.error(e)
    return { ok: false, message: 'Couldn’t reach IndexNow. Try again in a minute.' }
  }
}
export const setCloudflarePlanAction = async (plan: string) =>
  run((c) => setCloudflarePlan(c, plan))
