import type { Metadata } from 'next'
import { requireUser } from '@/lib/server/context'
import { DashboardNav } from './DashboardNav'

export const metadata: Metadata = { title: 'Your codes', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  return (
    <div className="mx-auto max-w-[1200px] px-4 md:px-6">
      <DashboardNav email={user.email} />
      <div className="pb-12 pt-6">{children}</div>
    </div>
  )
}
