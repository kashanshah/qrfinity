import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/server/context'
import { env } from '@/lib/server/env'
import { LoginForm } from './LoginForm'

export const metadata: Metadata = { title: 'Sign in', robots: { index: false } }
export const dynamic = 'force-dynamic'

/** Only same-site paths are allowed as the post-sign-in destination. */
function safeNext(next: string | undefined) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard'
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>
}) {
  const { next, error } = await searchParams
  const target = safeNext(next)
  if (await getSessionUser()) redirect(target)
  return (
    <div className="mx-auto max-w-[440px] px-4 py-12 md:py-16">
      <h1 className="heading text-ink">Sign in or create your free account</h1>
      <p className="mt-2 text-ink-muted">
        No password, no credit card. We email you a link that signs you in. Your codes never expire,
        whatever happens to your account.
      </p>
      <div className="mt-8">
        <LoginForm
          next={target}
          google={!!env.google}
          siteKey={env.turnstileDisabled ? undefined : process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
          linkError={
            error
              ? 'That sign-in link has expired or was already used. Ask for a new one.'
              : undefined
          }
        />
      </div>
    </div>
  )
}
