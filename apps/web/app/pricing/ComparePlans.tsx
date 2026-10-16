import { PLANS, PLAN_DETAILS, TRIAL_DAYS, type Plan } from '@qrfinity/core'
import { Check, Clock, Minus } from 'lucide-react'
import type { ReactNode } from 'react'

type Cell = ReactNode | ((plan: Plan) => ReactNode)
type Row = { label: string; hint?: string; cell: Cell }
type Group = { title: string; note?: ReactNode; rows: Row[] }

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
    note: (
      <>
        Extras that change how a dynamic code behaves: your own short link, sending people to
        different places, and soon a password. Free on 1 code; a plan covers more.{' '}
        <a href="#advanced" className="text-evergreen underline">
          What each one does
        </a>
      </>
    ),
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
      {/* No scroll box: the page scrolls and the plan names stick to the top of the screen. The
          table fits a phone by tightening spacing and type instead of scrolling sideways. */}
      <div className="mt-5 rounded-lg border border-hairline bg-surface">
        <table className="w-full table-fixed border-separate border-spacing-0 text-ink">
          <caption className="sr-only">Features and limits of each QRfinity plan</caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky top-0 z-10 w-[29%] min-[400px]:w-[33%] rounded-tl-lg border-b border-hairline bg-surface p-2 text-left align-bottom font-normal sm:w-[36%] sm:p-4"
              >
                <span className="sr-only">Feature</span>
              </th>
              {PLANS.map((p) => (
                <th
                  key={p}
                  scope="col"
                  className={`sticky top-0 z-10 border-b border-hairline px-1 py-3 text-center align-bottom last:rounded-tr-lg sm:p-4 ${p === 'free' ? 'bg-mint' : 'bg-surface'}`}
                >
                  <span className="block text-[13px] font-bold leading-5 min-[400px]:text-[15px] sm:text-[20px] sm:leading-7">
                    {PLAN_DETAILS[p].name}
                  </span>
                  <span className="block text-[12px] font-normal leading-4 text-ink-muted sm:text-[14px] sm:leading-5">
                    {`$${PLAN_DETAILS[p].monthlyUsd ?? 0}/mo`}
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
                  className="label border-t border-hairline bg-surface-sunk px-3 py-2 text-left text-ink sm:px-4"
                >
                  {g.title}
                  {g.note ? (
                    <span className="body-small mt-0.5 block font-normal text-ink-muted">
                      {g.note}
                    </span>
                  ) : null}
                </th>
              </tr>
              {g.rows.map((r) => (
                <tr key={r.label}>
                  <th
                    scope="row"
                    className="border-t border-hairline px-2 py-3 text-left text-[14px] font-normal leading-5 [overflow-wrap:anywhere] sm:px-4 sm:text-[16px] sm:leading-6"
                  >
                    <span className="block">{r.label}</span>
                    {r.hint ? (
                      <span className="mt-0.5 block text-[12px] leading-4 text-ink-muted sm:text-[14px] sm:leading-5">
                        {r.hint}
                      </span>
                    ) : null}
                  </th>
                  {PLANS.map((p) => (
                    <td
                      key={p}
                      className={`border-t border-hairline px-1 py-3 text-center text-[12px] leading-5 min-[400px]:text-[13px] sm:px-4 sm:text-[16px] sm:leading-6 ${p === 'free' ? 'bg-mint/40' : ''}`}
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
