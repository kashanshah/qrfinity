import { getCloudflareUsage } from '@/lib/server/cloudflare-usage'
import { getDb } from '@/lib/server/db'
import { env } from '@/lib/server/env'
import { getMailer } from '@/lib/server/mailer'
import { checkUsageAlert } from '@/lib/server/usage-alert'

export const dynamic = 'force-dynamic'

/** Hourly (vercel.json): email the admins if today's Cloudflare usage nears a free-plan limit. */
export async function GET(req: Request) {
  const secret = env.cronSecret
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`)
    return new Response('Unauthorized', { status: 401 })
  return Response.json(
    await checkUsageAlert({
      db: getDb(),
      cf: getCloudflareUsage(),
      mailer: getMailer(),
      adminEmails: env.adminEmails,
      siteUrl: env.appUrl,
    }),
  )
}
