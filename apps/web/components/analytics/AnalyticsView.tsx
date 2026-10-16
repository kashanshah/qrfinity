'use client'

import { weekly, type Breakdown, type ScanReport } from '@qrfinity/core'
import { Download, Table2 } from 'lucide-react'
import Link from 'next/link'
import { rangeLabel } from '@/lib/days'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'

const COUNTRY = new Intl.DisplayNames(['en'], { type: 'region' })
const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })
const full = new Intl.NumberFormat('en')
const dayFmt = new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', timeZone: 'UTC' })

function countryName(code: string) {
  try {
    return code ? (COUNTRY.of(code) ?? code) : 'Unknown'
  } catch {
    return code || 'Unknown'
  }
}

const DEVICE_LABEL: Record<string, string> = {
  mobile: 'Phone',
  tablet: 'Tablet',
  desktop: 'Computer',
  other: 'Other',
}

type Series = { label: string; scans: number; uniques?: number }[]

/** Rounded-up "nice" maximum for an axis: 1, 2, 5 × 10^n. */
function niceMax(v: number) {
  if (v <= 4) return 4
  const p = 10 ** Math.floor(Math.log10(v))
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p
  return 10 * p
}

/**
 * Single-series column chart (scans over time, scans by hour). Pointer and arrow keys
 * snap to the nearest column and show its readout; values also live in the table view.
 */
function ColumnChart({
  data,
  title,
  valueLabel = 'scans',
}: {
  data: Series
  title: string
  valueLabel?: string
}) {
  const [active, setActive] = useState<number | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  // Draw at the container's real width so axis text stays at its intended size.
  const [W, setW] = useState(720)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) =>
      setW(Math.max(280, Math.round(entry!.contentRect.width))),
    )
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const H = 200
  const pad = { l: 36, r: 8, t: 8, b: 24 }
  const max = niceMax(Math.max(0, ...data.map((d) => d.scans)))
  const slot = (W - pad.l - pad.r) / Math.max(1, data.length)
  const barW = Math.max(1, Math.min(24, slot - 2))
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max)
  const ticks = [0, max / 2, max]
  const labelEvery = Math.ceil(data.length / Math.max(3, Math.floor(W / 90)))

  const indexAt = (e: PointerEvent<HTMLDivElement>) => {
    const box = ref.current!.getBoundingClientRect()
    const x = ((e.clientX - box.left) / box.width) * W - pad.l
    return Math.max(0, Math.min(data.length - 1, Math.floor(x / slot)))
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') setActive((i) => Math.min(data.length - 1, (i ?? -1) + 1))
    else if (e.key === 'ArrowLeft') setActive((i) => Math.max(0, (i ?? data.length) - 1))
    else if (e.key === 'Escape') setActive(null)
    else return
    e.preventDefault()
  }
  const a = active !== null ? data[active] : null

  return (
    <div
      ref={ref}
      className="relative"
      tabIndex={0}
      role="group"
      aria-label={`${title}. Use the left and right arrow keys to read each value.`}
      onPointerMove={(e) => setActive(indexAt(e))}
      onPointerLeave={() => setActive(null)}
      onKeyDown={onKey}
      onBlur={() => setActive(null)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" aria-hidden="true">
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={pad.l}
              x2={W - pad.r}
              y1={y(t)}
              y2={y(t)}
              stroke="var(--hairline)"
              strokeWidth={1}
            />
            <text
              x={pad.l - 6}
              y={y(t) + 4}
              textAnchor="end"
              fontSize={11}
              fill="var(--ink-muted)"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {compact.format(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = pad.l + i * slot + (slot - barW) / 2
          const h = y(0) - y(d.scans)
          const r = Math.min(4, barW / 2, h)
          return (
            <g key={i}>
              {d.scans > 0 ? (
                <path
                  d={`M${x} ${y(0)}V${y(0) - h + r}Q${x} ${y(0) - h} ${x + r} ${y(0) - h}H${x + barW - r}Q${x + barW} ${y(0) - h} ${x + barW} ${y(0) - h + r}V${y(0)}Z`}
                  fill="var(--evergreen)"
                  opacity={active === null || active === i ? 1 : 0.55}
                />
              ) : null}
              {i % labelEvery === 0 ? (
                <text
                  x={x + barW / 2}
                  y={H - 6}
                  textAnchor="middle"
                  fontSize={11}
                  fill="var(--ink-muted)"
                >
                  {d.label}
                </text>
              ) : null}
            </g>
          )
        })}
      </svg>
      {a ? (
        <div
          className="pointer-events-none absolute top-0 z-10 rounded-md border border-hairline bg-surface px-3 py-2 shadow-card"
          style={{
            left: `${(((pad.l + (active! + 0.5) * slot) / W) * 100).toFixed(2)}%`,
            transform: active! > data.length / 2 ? 'translateX(-105%)' : 'translateX(5%)',
          }}
          aria-live="polite"
        >
          <p className="body-small whitespace-nowrap text-ink-muted">{a.label}</p>
          <p className="whitespace-nowrap">
            <strong className="font-bold text-ink">{full.format(a.scans)}</strong>{' '}
            <span className="body-small text-ink-muted">{valueLabel}</span>
          </p>
          {a.uniques !== undefined ? (
            <p className="whitespace-nowrap">
              <strong className="font-bold text-ink">{full.format(a.uniques)}</strong>{' '}
              <span className="body-small text-ink-muted">unique</span>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/** Ranked list with a bar per row; the value sits at the bar's tip. */
function BarList({
  title,
  rows,
  format = (k: string) => k || 'Unknown',
}: {
  title: string
  rows: Breakdown
  format?: (k: string) => string
}) {
  const max = Math.max(1, ...rows.map((r) => r.scans))
  return (
    <section className="rounded-lg border border-hairline bg-surface p-4 md:p-6">
      <h3 className="subheading mb-3 text-ink">{title}</h3>
      {rows.length === 0 ? (
        <p className="body-small text-ink-muted">No scans yet.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.key} className="grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-3">
              <span className="body-small truncate text-ink" title={format(r.key)}>
                {format(r.key)}
              </span>
              <span className="flex items-center gap-2">
                <span
                  className="h-3 rounded-r-[4px] bg-evergreen"
                  style={{ width: `${Math.max(2, (r.scans / max) * 80)}%` }}
                  aria-hidden="true"
                />
                <span
                  className="body-small text-ink-muted"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {full.format(r.scans)}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function StatTile({
  label,
  value,
  hero = false,
}: {
  label: string
  value: string
  hero?: boolean
}) {
  return (
    <div className="rounded-lg border border-hairline bg-surface p-4 md:p-6">
      <p className="label text-ink-muted">{label}</p>
      <p className={`mt-1 font-bold text-ink ${hero ? 'text-5xl leading-[56px]' : 'subheading'}`}>
        {value}
      </p>
    </div>
  )
}

function csvEscape(v: string | number) {
  const s = String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function AnalyticsView({
  report,
  days,
  live,
  basePath,
  ranges = [7, 30, 90],
  history = false,
}: {
  report: ScanReport
  days: number
  live: boolean
  basePath: string
  /** Ranges this user can choose; longer than 90 days needs analytics history. */
  ranges?: number[]
  /** True when the report comes from daily roll-ups (complete days up to yesterday). */
  history?: boolean
}) {
  const [grain, setGrain] = useState<'day' | 'week'>(days > 30 ? 'week' : 'day')
  const [showTable, setShowTable] = useState(false)

  const series: Series = useMemo(
    () =>
      grain === 'day'
        ? report.daily.map((d) => ({
            label: dayFmt.format(new Date(d.date + 'T00:00:00Z')),
            scans: d.scans,
            uniques: d.uniques,
          }))
        : weekly(report.daily).map((w) => ({
            label: `Week of ${dayFmt.format(new Date(w.week + 'T00:00:00Z'))}`,
            scans: w.scans,
            uniques: w.uniques,
          })),
    [report, grain],
  )
  const hours: Series = report.hourOfDay.map((scans, h) => ({
    label: `${String(h).padStart(2, '0')}:00`,
    scans,
  }))

  function exportCsv() {
    const lines = [[grain === 'day' ? 'date' : 'week_starting', 'scans', 'unique_scans'].join(',')]
    const src =
      grain === 'day'
        ? report.daily.map((d) => [d.date, d.scans, d.uniques])
        : weekly(report.daily).map((w) => [w.week, w.scans, w.uniques])
    for (const r of src) lines.push(r.map(csvEscape).join(','))
    lines.push('', 'hour_utc,scans', ...report.hourOfDay.map((s, h) => `${h},${s}`))
    for (const [name, rows] of [
      ['country', report.countries],
      ['city', report.cities],
      ['device', report.devices],
      ['os', report.os],
      ['browser', report.browsers],
      ['referrer', report.referrers],
    ] as const) {
      lines.push('', `${name},scans`, ...rows.map((r) => `${csvEscape(r.key)},${r.scans}`))
    }
    const url = URL.createObjectURL(new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `qrfinity-scans-${days}d.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  const topCountry = report.countries[0]
  const topDevice = report.devices[0]
  const pill = (on: boolean) =>
    `label rounded-md px-3 py-2 ${on ? 'bg-mint font-bold text-ink' : 'text-ink-muted hover:bg-surface-sunk hover:text-ink'}`

  return (
    <div className="flex flex-col gap-6">
      {/* Filters: one row, above everything they scope. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Date range" className="flex flex-wrap gap-1">
          {ranges.map((d) => (
            <Link
              key={d}
              href={`${basePath}?days=${d}`}
              scroll={false}
              aria-current={d === days ? 'page' : undefined}
              className={pill(d === days)}
            >
              {rangeLabel(d)}
            </Link>
          ))}
        </nav>
        <div className="flex gap-1">
          <button
            type="button"
            className={pill(grain === 'day')}
            aria-pressed={grain === 'day'}
            onClick={() => setGrain('day')}
          >
            By day
          </button>
          <button
            type="button"
            className={pill(grain === 'week')}
            aria-pressed={grain === 'week'}
            onClick={() => setGrain('week')}
          >
            By week
          </button>
        </div>
      </div>

      {!live ? (
        <p className="body-small rounded-md bg-surface-sunk px-4 py-3 text-ink-muted">
          Analytics isn’t connected in this environment, so every count shows zero.
        </p>
      ) : null}
      {history ? (
        <p className="body-small rounded-md bg-surface-sunk px-4 py-3 text-ink-muted">
          Long ranges come from daily totals, updated each night. They cover complete days up to
          yesterday.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Scans" value={full.format(report.totals.scans)} hero />
        <StatTile label="Unique scans" value={full.format(report.totals.uniques)} />
        <StatTile label="Top country" value={topCountry ? countryName(topCountry.key) : '–'} />
        <StatTile
          label="Top device"
          value={topDevice ? (DEVICE_LABEL[topDevice.key] ?? topDevice.key) : '–'}
        />
      </div>

      <section className="rounded-lg border border-hairline bg-surface p-4 md:p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="subheading text-ink">Scans over time</h3>
          <div className="flex gap-1">
            <button
              type="button"
              className={pill(showTable)}
              aria-pressed={showTable}
              onClick={() => setShowTable((v) => !v)}
            >
              <Table2 aria-hidden="true" size={16} strokeWidth={1.75} className="mr-1 inline" />
              Table
            </button>
            <button type="button" className={pill(false)} onClick={exportCsv}>
              <Download aria-hidden="true" size={16} strokeWidth={1.75} className="mr-1 inline" />
              CSV
            </button>
          </div>
        </div>
        {showTable ? (
          <div className="max-h-80 overflow-auto">
            <table className="body-small w-full text-left">
              <thead className="sticky top-0 bg-surface text-ink-muted">
                <tr>
                  <th className="py-1 pr-4 font-normal">{grain === 'day' ? 'Date' : 'Week'}</th>
                  <th className="py-1 pr-4 text-right font-normal">Scans</th>
                  <th className="py-1 text-right font-normal">Unique</th>
                </tr>
              </thead>
              <tbody style={{ fontVariantNumeric: 'tabular-nums' }}>
                {series.map((r) => (
                  <tr key={r.label} className="border-t border-hairline text-ink">
                    <td className="py-1 pr-4">{r.label}</td>
                    <td className="py-1 pr-4 text-right">{full.format(r.scans)}</td>
                    <td className="py-1 text-right">{full.format(r.uniques ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <ColumnChart data={series} title="Scans over time" />
        )}
        <p className="body-small mt-2 text-ink-muted">
          Days in UTC. A unique scan is one person on one day.
        </p>
      </section>

      <section className="rounded-lg border border-hairline bg-surface p-4 md:p-6">
        <h3 className="subheading mb-3 text-ink">Scans by hour (UTC)</h3>
        <ColumnChart data={hours} title="Scans by hour of day, UTC" />
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <BarList title="Countries" rows={report.countries} format={countryName} />
        <BarList title="Cities" rows={report.cities} />
        <BarList title="Devices" rows={report.devices} format={(k) => DEVICE_LABEL[k] ?? k} />
        <BarList title="Operating systems" rows={report.os} />
        <BarList title="Browsers and apps" rows={report.browsers} />
        <BarList title="Referrers" rows={report.referrers} />
      </div>
    </div>
  )
}
