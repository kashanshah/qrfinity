'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'

const LINKS = [
  { href: '/dashboard', label: 'Codes' },
  { href: '/dashboard/analytics', label: 'Analytics' },
  { href: '/dashboard/account', label: 'Account' },
]

export function DashboardNav({ email }: { email: string }) {
  const path = usePathname()
  const router = useRouter()
  const active = (href: string) =>
    href === '/dashboard'
      ? path === href || path.startsWith('/dashboard/codes')
      : path.startsWith(href)
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline py-3">
      <nav aria-label="Dashboard" className="flex gap-1">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active(l.href) ? 'page' : undefined}
            className={`label rounded-md px-3 py-2 ${active(l.href) ? 'bg-mint font-bold text-ink' : 'text-ink-muted hover:bg-surface-sunk hover:text-ink'}`}
          >
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="flex items-center gap-3">
        <span className="body-small hidden text-ink-muted sm:inline">{email}</span>
        <button
          type="button"
          className="label rounded-md px-3 py-2 text-evergreen hover:bg-surface-sunk"
          onClick={async () => {
            await authClient.signOut()
            router.push('/')
            router.refresh()
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
