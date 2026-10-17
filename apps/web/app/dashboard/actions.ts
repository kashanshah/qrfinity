'use server'

import type { Design } from '@qrfinity/core'
import type { CodeContent } from '@qrfinity/db'
import { revalidatePath } from 'next/cache'
import {
  ServiceError,
  createDynamicCode,
  createFolder,
  deleteCode,
  deleteFolder,
  duplicateCode,
  renameFolder,
  setCodeTags,
  setPageStyle,
  setPaused,
  setRules,
  setPassword,
  setSplit,
  setLimits,
  updateDestination,
  updateDetails,
} from '@/lib/server/codes'
import { serviceContext } from '@/lib/server/context'

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  /** `code` says what kind of failure it was, for site analytics (never the message). */
  | { ok: false; error: string; code: ServiceError['code'] | 'server' }

async function run<T>(
  fn: (ctx: Awaited<ReturnType<typeof serviceContext>>) => Promise<T>,
): Promise<ActionResult<T>> {
  const ctx = await serviceContext()
  try {
    const data = await fn(ctx)
    revalidatePath('/dashboard', 'layout')
    return { ok: true, data }
  } catch (error) {
    if (error instanceof ServiceError) return { ok: false, error: error.message, code: error.code }
    console.error(error)
    return {
      ok: false,
      error: 'Something went wrong on our side. Your code is safe; try again in a moment.',
      code: 'server',
    }
  }
}

export async function createCodeAction(input: {
  name: string
  /** Leave out for a contact card. */
  destination?: string
  content: CodeContent | null
  design: Design
  folderId: string | null
  slug?: string | null
}) {
  return run(async (ctx) => (await createDynamicCode(ctx, input)).id)
}

export async function saveCodeAction(
  id: string,
  input: { destination?: string; content?: CodeContent | null; design?: Design },
) {
  return run(async (ctx) => {
    // A destination, or contact card details (content with no destination).
    if (input.destination !== undefined || input.content?.type === 'vcard')
      await updateDestination(ctx, id, { destination: input.destination, content: input.content })
    if (input.design) await updateDetails(ctx, id, { design: input.design })
    return undefined
  })
}

export async function renameCodeAction(id: string, name: string) {
  return run(async (ctx) => void (await updateDetails(ctx, id, { name })))
}

export async function moveCodeAction(id: string, folderId: string | null) {
  return run(async (ctx) => void (await updateDetails(ctx, id, { folderId })))
}

export async function setTagsAction(id: string, tags: string[]) {
  return run(async (ctx) => (await setCodeTags(ctx, id, tags)).tags)
}

export async function setPageStyleAction(id: string, style: unknown) {
  return run(async (ctx) => void (await setPageStyle(ctx, id, style)))
}

export async function setRulesAction(id: string, rules: unknown) {
  // Returns the rules as stored (destinations normalized), so the editor shows exactly those.
  return run(async (ctx) => (await setRules(ctx, id, rules)).rules ?? [])
}

/** `null` removes the password. Returns whether the code is now protected. */
export async function setPasswordAction(id: string, password: string | null) {
  return run(async (ctx) => (await setPassword(ctx, id, password)).hasPassword)
}

/** Returns the split as stored (destinations normalized), so the editor shows exactly that. */
export async function setSplitAction(id: string, variants: unknown) {
  return run(async (ctx) => (await setSplit(ctx, id, variants)).split)
}

/** `null` removes the limits. Returns them as stored. */
export async function setLimitsAction(
  id: string,
  limits: { dest: string; date: string; time: string; timezone: string; scans: string } | null,
) {
  return run(async (ctx) => (await setLimits(ctx, id, limits)).limits)
}

export async function setPausedAction(id: string, paused: boolean) {
  return run(async (ctx) => void (await setPaused(ctx, id, paused)))
}

export async function deleteCodeAction(id: string) {
  return run((ctx) => deleteCode(ctx, id))
}

export async function duplicateCodeAction(id: string) {
  return run(async (ctx) => (await duplicateCode(ctx, id)).id)
}

export async function createFolderAction(name: string) {
  return run(async (ctx) => (await createFolder(ctx, name)).id)
}

export async function renameFolderAction(id: string, name: string) {
  return run((ctx) => renameFolder(ctx, id, name))
}

export async function deleteFolderAction(id: string) {
  return run((ctx) => deleteFolder(ctx, id))
}
