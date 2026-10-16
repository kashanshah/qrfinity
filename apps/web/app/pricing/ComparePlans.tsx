import { PLANS, PLAN_DETAILS, TRIAL_DAYS, type Plan } from '@qrfinity/core'
import { Check, Clock, Minus } from 'lucide-react'
import type { ReactNode } from 'react'

type Cell = ReactNode | ((plan: Plan) => ReactNode)
type Row = { label: string; hint?: string; cell: Cell }
type Group = { title: string; rows: Row[] }

const yes = (
  <>
    <Check aria-hidden="true" size={20} strokeWidth={2} className="mx-auto text-evergreen" />
    <span className="sr-only">Included</span>
  </>
)
const soon = (
  <span className="inline-flex items-center gap-1 text-ink-muted">
    <Clock aria-hidden="true" size={16} strokeWidth={1.75} />
    Soon
  </span>
)
const none = (
  <>
    <Minus aria-hidden="true" size={20} strokeWidth={1.75} className="mx-auto text-ink-muted" />
    <span className="sr-only">Not included</span>
  </>
)

const codes = (plan: Plan) => {
  const n = PLAN_DETAILS[plan].advancedCodes
  return Number.isFinite(n) ? `${n} ${n === 1 ? 'code' : 'codes'}` : 'Every code'
}

const GROUPS: Group[] = [
  {
    title: 'Price',
    rows: [
      {
        label: 'Monthly',
        cell: (p) => {
          const m = PLAN_DETAILS[p].monthlyUsd
          return m === null ? '$0' : `$${m}`
        },
      },
      {
        label: 'Yearly',
        hint: '2 months free',
        cell: (p) => {
          const y = PLAN_DETAILS[p].yearlyUsd
          return y === null ? '$0' : `$${y}`
        },
      },
      {
        label: 'Free trial',
        hint: 'On your first plan',
        cell: (p) => (p === 'free' ? none : `${TRIAL_DAYS} days`),
      },
    ],
  },
  {
    title: 'Free on every plan',
    rows: [
      { label: 'Static QR codes', cell: 'Unlimited' },
      { label: 'Dynamic QR codes', cell: 'Unlimited' },
      { label: 'Change where a code points, any time', cell: yes },
      { label: 'Dynamic contact cards', hint: '4 page templates, your colour', cell: yes },
      { label: 'Every design option', hint: 'Colours, shapes, logo, frames', cell: yes },
      { label: 'Every format', hint: 'PNG, JPG, SVG, PDF, EPS', cell: yes },
      { label: 'Scan analytics', hint: 'Up to 2 years, CSV download', cell: yes },
      { label: 'Export all your codes', cell: yes },
      { label: 'Codes never expire', cell: yes },
      { label: 'No watermark, no ads', cell: yes },
    ],
  },
  {
    title: 'Advanced features',
    rows: [
      { label: 'Codes that can use advanced features', cell: codes },
      { label: 'Custom short links', hint: 'qrfinity.link/your-name', cell: yes },
      { label: 'Redirect rules', hint: 'By phone, country, day or time', cell: yes },
      { label: 'Password protection', cell: soon },
    ],
  },
]

/** Every plan side by side. Built from PLAN_DETAILS, so prices and allowances never drift. */
export function ComparePlans() {
  return (
    <section aria-labelledby="compare" className="mt-12">
      <h2 id="compare" className="heading text-ink">
        Compare plans
      </h2>
      <p className="mt-1 max-w-[65ch] text-ink-muted">
        Every feature is in every plan. A plan only sets how many of your codes can use advanced
        features. When a plan ends, every code and short link keeps working.
      </p>
      <p className="body-small mt-3 text-ink-muted sm:hidden">
        Scroll the table sideways to see every plan.
      </p>
      {/* Phones scroll the table sideways; the feature column stays in view. */}
      <div className="mt-3 overflow-x-auto sm:mt-5 rounded-lg border border-hairline bg-surface">
        <table className="w-full min-w-[600px] border-collapse text-ink">
          <caption className="sr-only">Features and limits of each QRfinity plan</caption>
          <thead>
            <tr className="border-b border-hairline">
              <th
                scope="col"
                className="sticky left-0 bg-surface p-4 text-left align-bottom font-normal"
              >
                <span className="sr-only">Feature</span>
              </th>
              {PLANS.map((p) => (
                <th
                  key={p}
                  scope="col"
                  className={`w-[17%] p-4 text-center align-bottom ${p === 'free' ? 'bg-mint' : ''}`}
                >
                  <span className="subheading block">{PLAN_DETAILS[p].name}</span>
                  <span className="body-small font-normal text-ink-muted">
                    {PLAN_DETAILS[p].monthlyUsd === null
                      ? 'Free forever'
                      : `$${PLAN_DETAILS[p].monthlyUsd}/month`}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          {GROUPS.map((g) => (
            <tbody key={g.title}>
              <tr>
                <th
                  scope="colgroup"
                  colSpan={PLANS.length + 1}
                  className="label bg-surface-sunk px-4 py-2 text-left text-ink"
                >
                  {g.title}
                </th>
              </tr>
              {g.rows.map((r) => (
                <tr key={r.label} className="border-t border-hairline">
                  <th
                    scope="row"
                    className="sticky left-0 w-[150px] bg-surface px-3 py-3 text-left font-normal sm:w-auto sm:px-4"
                  >
                    <span className="block">{r.label}</span>
                    {r.hint ? (
                      <span className="body-small block text-ink-muted">{r.hint}</span>
                    ) : null}
                  </th>
                  {PLANS.map((p) => (
                    <td
                      key={p}
                      className={`px-4 py-3 text-center ${p === 'free' ? 'bg-mint/40' : ''}`}
                    >
                      {typeof r.cell === 'function' ? r.cell(p) : r.cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </section>
  )
}
