import { env } from '@/lib/server/env'
import { DevMailbox } from '@/lib/server/mailer'

export const dynamic = 'force-dynamic'

/** Development and end-to-end tests only (DEV_MAILBOX=1): the latest emails sent to an address. */
export async function GET(req: Request) {
  if (!env.devMailbox) return new Response('Not found', { status: 404 })
  const to = new URL(req.url).searchParams.get('to') ?? ''
  return Response.json(DevMailbox.messagesFor(to))
}
