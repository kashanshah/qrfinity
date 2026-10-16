'use client'

import { QrCode } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

/** "Your codes": the way back to the codes list from anywhere, the dashboard included. */
export function HeaderAccountLink() {
  const path = usePathname()
  if (path.startsWith('/admin')) return null
  return (
    <Link
      href="/dashboard"
      aria-current={path === '/dashboard' ? 'page' : undefined}
      className="label inline-flex min-h-10 items-center gap-2 rounded-md border-[1.5px] border-evergreen px-3 font-bold text-evergreen hover:bg-mint"
    >
      <QrCode aria-hidden="true" size={16} strokeWidth={1.75} />
      Your codes
    </Link>
  )
}
