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
  setPaused,
  updateDestination,
  updateDetails,
} from '@/lib/server/codes'
import { serviceContext } from '@/lib/server/context'

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string }

async function run<T>(
  fn: (ctx: Awaited<ReturnType<typeof serviceContext>>) => Promise<T>,
): Promise<ActionResult<T>> {
  const ctx = await serviceContext()
  try {
    const data = await fn(ctx)
    revalidatePath('/dashboard', 'layout')
    return { ok: true, data }
  } catch (error) {
    if (error instanceof ServiceError) return { ok: false, error: error.message }
    console.error(error)
    return {
      ok: false,
      error: 'Something went wrong on our side. Your code is safe; try again in a moment.',
    }
  }
}

export async function createCodeAction(input: {
  name: string
  destination: string
  content: CodeContent | null
  design: Design
  folderId: string | null
}) {
  return run(async (ctx) => (await createDynamicCode(ctx, input)).id)
}

export async function saveCodeAction(
  id: string,
  input: { destination?: string; content?: CodeContent | null; design?: Design },
) {
  return run(async (ctx) => {
    if (input.destination !== undefined)
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
