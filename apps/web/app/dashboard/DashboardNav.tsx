'use client'

import { ChartColumn, ChevronDown, LogOut, QrCode, UserRound } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { authClient } from '@/lib/auth-client'

const LINKS = [
  { href: '/dashboard', label: 'Codes', icon: QrCode },
  { href: '/dashboard/analytics', label: 'Analytics', icon: ChartColumn },
  { href: '/dashboard/account', label: 'Account', icon: UserRound },
]

export function DashboardNav({ email }: { email: string }) {
  const path = usePathname()
  const active = (href: string) =>
    href === '/dashboard'
      ? path === href || path.startsWith('/dashboard/codes') || path.startsWith('/dashboard/new')
      : path.startsWith(href)
  return (
    <div className="flex items-end justify-between gap-3 border-b border-hairline">
      <nav aria-label="Dashboard" className="-mb-px flex gap-1 overflow-x-auto">
        {LINKS.map(({ href, label, icon: Icon }) => {
          const on = active(href)
          return (
            <Link
              key={href}
              href={href}
              aria-current={on ? 'page' : undefined}
              className={`label flex min-h-12 shrink-0 items-center gap-2 border-b-2 px-2 sm:px-3 ${
                on
                  ? 'border-evergreen font-bold text-ink'
                  : 'border-transparent text-ink-muted hover:border-hairline hover:text-ink'
              }`}
            >
              <Icon aria-hidden="true" size={16} strokeWidth={1.75} className="hidden sm:block" />
              {label}
            </Link>
          )
        })}
      </nav>
      <AccountMenu email={email} />
    </div>
  )
}

function AccountMenu({ email }: { email: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (
        e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)
      )
        setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  return (
    <div ref={ref} className="relative mb-1.5">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-10 items-center gap-2 rounded-pill py-1 pl-1 pr-2 text-ink hover:bg-surface-sunk"
      >
        <Avatar email={email} />
        <span className="body-small hidden max-w-[24ch] truncate sm:inline">{email}</span>
        <ChevronDown
          aria-hidden="true"
          size={16}
          strokeWidth={1.75}
          className={`text-ink-muted transition-transform ${open ? 'rotate-180' : ''}`}
        />
        <span className="sr-only">Account menu</span>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-12 z-40 w-64 rounded-lg border border-hairline bg-surface p-2 shadow-card"
        >
          <p className="body-small truncate px-3 pb-2 pt-1 text-ink-muted">
            Signed in as
            <br />
            <span className="font-bold text-ink">{email}</span>
          </p>
          <div className="my-1 border-t border-hairline" />
          <Link
            role="menuitem"
            href="/dashboard/account"
            onClick={() => setOpen(false)}
            className="flex min-h-11 items-center gap-2 rounded-md px-3 text-ink hover:bg-surface-sunk"
          >
            <UserRound aria-hidden="true" size={18} strokeWidth={1.75} />
            Account settings
          </Link>
          <button
            role="menuitem"
            type="button"
            className="flex min-h-11 w-full items-center gap-2 rounded-md px-3 text-ink hover:bg-surface-sunk"
            onClick={async () => {
              await authClient.signOut()
              router.push('/')
              router.refresh()
            }}
          >
            <LogOut aria-hidden="true" size={18} strokeWidth={1.75} />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  )
}

export function Avatar({ email, size = 'sm' }: { email: string; size?: 'sm' | 'lg' }) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full bg-evergreen font-bold uppercase text-on-evergreen ${
        size === 'lg' ? 'subheading size-14' : 'label size-8'
      }`}
    >
      {email.trim().charAt(0) || '?'}
    </span>
  )
}
