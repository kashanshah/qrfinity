import type { Metadata } from 'next'

// Drafts for legal review: never indexed until approved.
export const metadata: Metadata = { robots: { index: false, follow: true } }

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-[720px] px-4 py-12 md:py-16">
      <p
        role="note"
        className="label mb-8 rounded-md border-[1.5px] border-scan-fail bg-surface px-4 py-3 text-ink"
      >
        Draft for legal review. Not yet in effect.
      </p>
      {children}
    </article>
  )
}
