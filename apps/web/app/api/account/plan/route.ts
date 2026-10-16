import { getSessionUser } from '@/lib/server/context'
import { getDb } from '@/lib/server/db'
import { getEntitlements } from '@/lib/server/entitlements'
import { effectivePlanFor } from '@/lib/server/plan'

export const dynamic = 'force-dynamic'

/**
 * The visitor's plan and features, for client components on static pages (the generator's
 * download buttons). Signed out: the free plan.
 */
export async function GET() {
  const user = await getSessionUser()
  const headers = { 'Cache-Control': 'private, no-store' }
  if (!user) return Response.json({ signedIn: false, plan: 'free', features: [] }, { headers })
  const db = getDb()
  const [plan, features] = await Promise.all([
    effectivePlanFor(db, user.id),
    getEntitlements(db, user.id),
  ])
  return Response.json({ signedIn: true, plan, features: [...features] }, { headers })
}
