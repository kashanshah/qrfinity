'use server'

import { redirect } from 'next/navigation'
import { deleteAccount } from '@/lib/server/account'
import { billingPortalUrl, cancelSubscriptionsForDeletion } from '@/lib/server/billing'
import { serviceContext } from '@/lib/server/context'
import { env } from '@/lib/server/env'
import { getBilling } from '@/lib/server/stripe'

export async function deleteAccountAction() {
  const ctx = await serviceContext('/dashboard/account')
  try {
    // Stop charges first: if Stripe can't be reached, nothing is deleted and the person can retry.
    const billing = getBilling()
    if (billing) await cancelSubscriptionsForDeletion(ctx.db, billing, ctx.userId)
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

/** Opens the Stripe billing portal: change plan, update the card, see invoices or cancel. */
export async function billingPortalAction() {
  const ctx = await serviceContext('/dashboard/account')
  const billing = getBilling()
  let url: string
  try {
    if (!billing) throw new Error('Billing is not configured')
    url = await billingPortalUrl(ctx.db, billing, ctx.userId, `${env.appUrl}/dashboard/account`)
  } catch (e) {
    console.error(e)
    redirect('/dashboard/account?billing=error')
  }
  redirect(url)
}
