'use server'

import { deleteAccount } from '@/lib/server/account'
import { serviceContext } from '@/lib/server/context'

export async function deleteAccountAction() {
  const ctx = await serviceContext('/dashboard/account')
  try {
    await deleteAccount(ctx)
    return { ok: true as const }
  } catch (e) {
    console.error(e)
    return {
      ok: false as const,
      error: 'We couldn’t delete your account. Nothing was changed; please try again.',
    }
  }
}
