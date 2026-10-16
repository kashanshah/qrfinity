import { ChevronDown } from 'lucide-react'
import { faqPage, JsonLd } from './JsonLd'

export type FaqItem = { q: string; a: string }

/** FAQ as native disclosures (readable without JavaScript) plus FAQPage structured data. */
export function Faq({
  items,
  heading = 'Questions people ask',
}: {
  items: FaqItem[]
  heading?: string
}) {
  if (!items.length) return null
  return (
    <section aria-labelledby="faq" className="mt-12">
      <h2 id="faq" className="heading mb-4 text-ink">
        {heading}
      </h2>
      <div className="divide-y divide-hairline rounded-lg border border-hairline bg-surface">
        {items.map((f) => (
          <details key={f.q} className="group px-4 md:px-6">
            <summary className="flex min-h-14 list-none items-center justify-between gap-4 py-3 [&::-webkit-details-marker]:hidden">
              <h3 className="font-bold text-ink">{f.q}</h3>
              <ChevronDown
                aria-hidden="true"
                size={20}
                strokeWidth={1.75}
                className="shrink-0 transition-transform group-open:rotate-180"
              />
            </summary>
            <p className="max-w-[72ch] pb-4 text-ink">{f.a}</p>
          </details>
        ))}
      </div>
      <JsonLd data={faqPage(items)} />
    </section>
  )
}
