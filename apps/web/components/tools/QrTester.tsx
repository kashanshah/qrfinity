'use client'

import { DYNAMIC_TYPES, formatPrintSize, parseContent, type TestCheck } from '@qrfinity/core'
import { CircleCheck, CircleX, RotateCcw, TriangleAlert } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Generator } from '@/components/generator/Generator'
import { Button } from '@/components/ui/Button'
import { track } from '@/lib/analytics'
import { testQrImage, type QrTestResult } from '@/lib/qr-test'
import { QrInput, TYPE_LABEL, details } from './QrReader'

const VERDICT = {
  good: {
    title: 'This code should scan well',
    detail: 'It passed every check. Scan a test print with your phone before a big run.',
  },
  fair: {
    title: 'This code scans, with some risks',
    detail: 'It reads, but the points below can make it fail on some phones or in poor light.',
  },
  poor: {
    title: 'This code is likely to fail',
    detail: 'Fix the problems below before you print it.',
  },
} as const

/**
 * The QR code tester: upload a finished design (from any generator) and get a plain report on
 * whether it will scan: contrast, margin, small and blurry reads, error correction, density.
 */
export function QrTester({ shortLinkBase }: { shortLinkBase: string }) {
  const [result, setResult] = useState<QrTestResult | null>(null)
  const [image, setImage] = useState<string | null>(null)

  const analyze = useCallback(async (file: Blob) => {
    const r = await testQrImage(file)
    if (r) {
      setImage((old) => {
        if (old) URL.revokeObjectURL(old)
        return URL.createObjectURL(file)
      })
      setResult(r)
      track('qr_tested', {
        verdict: r.report.verdict,
        warnings: r.report.checks.filter((c) => c.status === 'warn').length,
        failures: r.report.checks.filter((c) => c.status === 'fail').length,
      })
    }
    return r?.text ?? null
  }, [])

  if (!result) {
    return (
      <QrInput
        heading="Add the QR code you want to test"
        analyze={analyze}
        onFound={() => {}}
        onRead={(source, text) =>
          text === null
            ? track('qr_read', { tool: 'tester', source, found: false, content_type: null })
            : undefined
        }
      />
    )
  }
  return (
    <Report
      result={result}
      image={image}
      shortLinkBase={shortLinkBase}
      onReset={() => setResult(null)}
    />
  )
}

const ICONS = {
  pass: { Icon: CircleCheck, className: 'text-evergreen', label: 'Passed' },
  warn: { Icon: TriangleAlert, className: 'text-ink-muted', label: 'Warning' },
  fail: { Icon: CircleX, className: 'text-ink', label: 'Problem' },
} as const

function Check({ check }: { check: TestCheck }) {
  const { Icon, className, label } = ICONS[check.status]
  return (
    <li className="flex gap-3 border-t border-hairline py-3 first:border-t-0">
      <Icon
        aria-hidden="true"
        size={20}
        strokeWidth={1.75}
        className={`mt-0.5 shrink-0 ${className}`}
      />
      <div>
        <p className="font-bold text-ink">
          <span className="sr-only">{label}: </span>
          {check.title}
        </p>
        <p className="body-small text-ink-muted">{check.detail}</p>
      </div>
    </li>
  )
}

function Report({
  result,
  image,
  shortLinkBase,
  onReset,
}: {
  result: QrTestResult
  image: string | null
  shortLinkBase: string
  onReset: () => void
}) {
  const { report, text } = result
  const parsed = useMemo(() => parseContent(text), [text])
  const [remake, setRemake] = useState(false)
  const verdict = VERDICT[report.verdict]
  // Problems first, then warnings, then passes.
  const order = { fail: 0, warn: 1, pass: 2 }
  const checks = [...report.checks].sort((a, b) => order[a.status] - order[b.status])

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-hairline bg-surface p-4 md:p-6">
        <div className="flex flex-wrap items-start gap-4">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element -- local object URL
            <img
              src={image}
              alt="The QR code you tested"
              className="size-24 shrink-0 rounded-md border border-hairline bg-ground object-contain p-1"
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <h2 className="subheading text-ink" aria-live="polite">
              {verdict.title}
            </h2>
            <p className="body-small mt-1 text-ink-muted">{verdict.detail}</p>
            <p className="mt-2 text-ink">
              Print it at least <strong>{formatPrintSize(report.minPrintMm)}</strong> wide, margin
              included.
            </p>
          </div>
          <Button
            icon={<RotateCcw aria-hidden="true" size={16} strokeWidth={1.75} />}
            onClick={onReset}
          >
            Test another code
          </Button>
        </div>

        <ul className="mt-4">
          {checks.map((c) => (
            <Check key={c.id} check={c} />
          ))}
        </ul>

        <details className="mt-4 border-t border-hairline pt-4">
          <summary className="label cursor-pointer text-ink">
            What it opens:{' '}
            {parsed.type === 'text'
              ? 'text'
              : (TYPE_LABEL[parsed.type] ?? parsed.type).toLowerCase()}
          </summary>
          <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-[max-content_1fr]">
            {details(parsed).map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="body-small text-ink-muted">{label}</dt>
                <dd className="break-all text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        </details>
      </div>

      <section aria-labelledby="remake" className="flex flex-col gap-4">
        <div>
          <h2 id="remake" className="subheading text-ink">
            {report.verdict === 'good' ? 'Want another like it?' : 'Make a code that scans better'}
          </h2>
          <p className="body-small mt-1 text-ink-muted">
            We’ve filled in the same content. The generator checks every design as you make it, and
            codes made on QRfinity never expire.
          </p>
        </div>
        {remake ? (
          <Generator
            init={{
              type: parsed.type,
              fields: { [parsed.type]: parsed.fields },
              kind: 'static',
            }}
            kindChoice={DYNAMIC_TYPES.includes(parsed.type)}
            shortLinkBase={shortLinkBase}
          />
        ) : (
          <div>
            <Button variant="primary" onClick={() => setRemake(true)}>
              Open in the generator
            </Button>
          </div>
        )}
      </section>
    </div>
  )
}
