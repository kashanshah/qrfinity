import { Check } from 'lucide-react'
import { Generator } from '@/components/generator/Generator'

const PROMISES = [
  'Static codes: free, unlimited, no sign-up, never expire.',
  'No watermark, no forced branding, every export format free.',
  'We never move a free feature behind a paywall.',
]

export default function HomePage() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 md:px-6">
      <section className="pb-8 pt-8 md:pb-12 md:pt-16">
        <h1 className="hero-title max-w-[16ch] text-ink">Free QR codes that never expire.</h1>
        <p className="subheading mt-4 max-w-[60ch] text-ink-muted">
          Print it once. It works forever. No sign-up, no trial, no watermark.
        </p>
      </section>

      <Generator />

      <section aria-labelledby="promise" className="mt-12 grid gap-8 md:mt-16 md:grid-cols-2">
        <div>
          <h2 id="promise" className="heading text-ink">
            Our promise
          </h2>
          <p className="mt-4 max-w-[60ch] text-ink">
            Many “free” generators make codes that stop working after a 7 to 14 day trial, often
            after they’re printed. Ours don’t. A static code holds your content directly, so it
            keeps working even if QRfinity disappeared.
          </p>
        </div>
        <ul className="flex flex-col gap-3 self-center">
          {PROMISES.map((p) => (
            <li key={p} className="flex gap-3 text-ink">
              <Check
                aria-hidden="true"
                size={20}
                strokeWidth={1.75}
                className="mt-[3px] shrink-0 text-evergreen"
              />
              {p}
            </li>
          ))}
        </ul>
      </section>

      <aside className="mt-12 rounded-lg bg-mint p-4 text-ink md:p-6">
        <p className="max-w-[72ch]">
          QRfinity is a free QR code generator. Static and dynamic codes are unlimited, include scan
          analytics, and never expire. No watermark, no trial, every format free (PNG, SVG, PDF).
        </p>
      </aside>
    </div>
  )
}
