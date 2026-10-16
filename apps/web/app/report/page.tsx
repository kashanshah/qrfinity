import type { Metadata } from 'next'
import { env } from '@/lib/server/env'
import { REPORT_REASONS } from '@/lib/server/reports'
import { ReportForm } from './ReportForm'

export const metadata: Metadata = {
  title: 'Report a QR code',
  description:
    'Tell us about a QRfinity code that leads to phishing, malware, scams or other abuse.',
}
export const dynamic = 'force-dynamic'

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>
}) {
  const { code } = await searchParams
  return (
    <div className="mx-auto max-w-[640px] px-4 py-12 md:py-16">
      <h1 className="heading text-ink">Report a QR code</h1>
      <p className="mt-2 text-ink-muted">
        If a QRfinity code sent you somewhere that asked for passwords or payment details, tried to
        install something, or looked like a scam, tell us. We review every report and turn off codes
        that break our{' '}
        <a href="/acceptable-use" className="text-evergreen underline">
          acceptable use policy
        </a>
        .
      </p>
      <div className="mt-8">
        <ReportForm
          initial={
            code ? `${env.shortDomain}/${code.replace(/[^0-9A-Za-z]/g, '').slice(0, 8)}` : ''
          }
          reasons={Object.entries(REPORT_REASONS).map(([value, label]) => ({ value, label }))}
          siteKey={env.turnstileDisabled ? undefined : process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
          abuseEmail={env.abuseEmail}
        />
      </div>
      <aside className="mt-10 rounded-lg bg-surface-sunk p-4 text-ink md:p-6">
        <h2 className="subheading">Already typed in a password or card number?</h2>
        <p className="mt-2 text-ink-muted">
          Change that password now, wherever you use it. If you entered card or bank details, call
          your bank using the number on your card.
        </p>
      </aside>
    </div>
  )
}
