import type { Metadata } from 'next'
import Link from 'next/link'
import { adminContext } from '@/lib/server/context'

export const metadata: Metadata = { title: 'Admin', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

const LINKS = [
  ['/admin', 'Queue'],
  ['/admin/codes', 'Codes'],
  ['/admin/users', 'Users'],
  ['/admin/blocklist', 'Blocklist'],
  ['/admin/waitlist', 'Waitlist'],
  ['/admin/flags', 'Feature flags'],
  ['/admin/usage', 'Usage'],
  ['/admin/settings', 'Settings'],
  ['/admin/audit', 'Audit log'],
] as const

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await adminContext()
  return (
    <div className="mx-auto max-w-[1200px] px-4 md:px-6">
      <nav aria-label="Admin" className="flex flex-wrap gap-1 border-b border-hairline py-3">
        <span className="label mr-2 self-center rounded-pill bg-scan-fail px-2.5 py-0.5 font-bold text-on-scan-fail">
          Admin
        </span>
        {LINKS.map(([href, label]) => (
          <Link
            key={href}
            href={href}
            className="label rounded-md px-3 py-2 text-ink hover:bg-surface-sunk"
          >
            {label}
          </Link>
        ))}
      </nav>
      <div className="pb-12 pt-6">{children}</div>
    </div>
  )
}
