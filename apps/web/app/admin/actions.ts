'use server'

import { revalidatePath } from 'next/cache'
import {
  addBlock,
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
