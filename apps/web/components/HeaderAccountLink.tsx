'use client'

import { QrCode } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

/** "Your codes", hidden inside the dashboard, which has its own menu. */
export function HeaderAccountLink() {
  const path = usePathname()
  if (path.startsWith('/dashboard') || path.startsWith('/admin')) return null
  return (
    <Link
      href="/dashboard"
      className="label inline-flex min-h-10 items-center gap-2 rounded-md border-[1.5px] border-evergreen px-3 font-bold text-evergreen hover:bg-mint"
    >
      <QrCode aria-hidden="true" size={16} strokeWidth={1.75} />
      Your codes
    </Link>
  )
}
