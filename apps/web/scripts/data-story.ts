/**
 * The "dead QR codes" study (docs/data-story.md): reads every QR code in a folder of photos,
 * follows each link with the QR code checker's own link check, and writes what share still work
 * and why the others don't.
 *
 *   pnpm --filter @qrfinity/web data-story ../../data-story            # first check
 *   pnpm --filter @qrfinity/web data-story ../../data-story --recheck  # re-check failures only
 *
 * The folder holds the photos (JPG or PNG) and, optionally, log.csv with one row per photo:
 * file,category,city,country,date,notes. It writes results.csv, results.json and summary.md next
 * to them. Photos and results stay out of git (they can hold personal data); only the summary's
 * numbers are published.
 *
 * Privacy: only the link's address is kept. Wi-Fi passwords, contact details and other non-link
 * contents are recorded by type alone.
 */
import { existsSync } from 'node:fs'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { identifyQrService, parseContent, SHORTENER_DOMAINS } from '@qrfinity/core'
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader'
import { checkLink, type LinkCheck } from '../lib/server/link-check'

type Row = {
  file: string
  category: string
  city: string
  country: string
  date: string
  /** What the code holds: 'url', 'wifi', 'vcard'…, or 'unreadable'. */
  type: string
  /** The link, for web links only. */
  url: string
  /** The QR service whose short link the code uses, if we know it. */
  service: string
  /** Through a short link (a QR service or a URL shortener) rather than the final address. */
  shortLink: boolean
  /** Same code as an earlier photo: counted once. */
  duplicateOf: string
  outcome: LinkCheck['outcome'] | 'unreadable' | 'not-a-link' | ''
  /** Plain reason for the summary. */
  reason: string
  finalUrl: string
  status: string
  checkedAt: string
  /** Earlier checks, oldest first, as outcome@ISO time. */
  history: string
}

const dir = resolve(process.argv[2] ?? '')
const recheck = process.argv.includes('--recheck')
if (!process.argv[2] || !existsSync(dir)) {
  console.error('Usage: data-story <folder of photos> [--recheck]')
  process.exit(1)
}

const REASONS: Record<string, string> = {
  works: 'Works',
  deactivated: 'Turned off by the QR service (trial or plan ended)',
  broken: 'Page gone (error page)',
  'unreachable:dns': 'Domain no longer exists',
  'unreachable:timeout': 'Site not responding',
  'unreachable:connection': 'Site not responding',
  'unreachable:too-many-redirects': 'Redirect loop',
  uncertain: 'Refused an automated check: verify by hand',
  'not-a-link': 'Not a link (Wi-Fi, contact, text…): works offline',
  unreadable: 'Code could not be read from the photo',
}

function reasonFor(r: LinkCheck | { outcome: 'unreadable' | 'not-a-link' }): string {
  const key = r.outcome === 'unreachable' ? `unreachable:${r.reason}` : r.outcome
  if (r.outcome === 'not-checked') return `Not checked (${r.reason})`
  return REASONS[key] ?? key
}

const isShortLink = (url: string) => {
  const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  return (SHORTENER_DOMAINS as readonly string[]).some(
    (d) => !d.includes('/') && (host === d || host.endsWith(`.${d}`)),
  )
}

// ---------------------------------------------------------------------------
// CSV

const csvCell = (v: unknown) => {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const endCell = () => {
    row.push(cell)
    cell = ''
  }
  const endRow = () => {
    endCell()
    rows.push(row)
    row = []
  }
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') endCell()
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      endRow()
    } else cell += c
  }
  if (cell || row.length) endRow()
  const [head = [], ...body] = rows.filter((r) => r.some((c) => c.trim()))
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])))
}

// ---------------------------------------------------------------------------

async function decode(file: string): Promise<string[]> {
  const bytes = new Uint8Array(await readFile(file))
  const found = await readBarcodes(bytes, {
    formats: ['QRCode'],
    tryHarder: true,
    maxNumberOfSymbols: 4,
  })
  return found.filter((b) => b.isValid).map((b) => b.text)
}

async function check(row: Row) {
  const r = await checkLink(row.url)
  if (row.outcome)
    row.history = [row.history, `${row.outcome}@${row.checkedAt}`].filter(Boolean).join(' ')
  row.outcome = r.outcome
  row.reason = reasonFor(r)
  row.finalUrl = 'finalUrl' in r ? r.finalUrl : ''
  row.status = 'status' in r ? String(r.status) : ''
  row.checkedAt = new Date().toISOString()
}

async function firstCheck(): Promise<Row[]> {
  const wasm = await readFile(new URL('../public/wasm/zxing_reader.wasm', import.meta.url))
  await prepareZXingModule({
    overrides: {
      wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength),
    },
    fireImmediately: true,
  })
  const logFile = join(dir, 'log.csv')
  const log = existsSync(logFile) ? parseCsv(await readFile(logFile, 'utf8')) : []
  const meta = new Map(log.map((r) => [r.file, r]))
  const files = (await readdir(dir)).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort()
  const skipped = (await readdir(dir)).filter((f) => /\.(heic|heif)$/i.test(f))
  if (skipped.length)
    console.warn(`Skipping ${skipped.length} HEIC photos: export them as JPG first.`)

  const rows: Row[] = []
  const seen = new Map<string, string>()
  for (const file of files) {
    const m = meta.get(file) ?? {}
    const base = {
      category: m.category ?? '',
      city: m.city ?? '',
      country: m.country ?? '',
      date: m.date ?? '',
    }
    const texts = await decode(join(dir, file)).catch(() => [])
    const blank = {
      url: '',
      service: '',
      shortLink: false,
      duplicateOf: '',
      finalUrl: '',
      status: '',
      checkedAt: '',
      history: '',
    }
    if (!texts.length) {
      rows.push({
        file,
        ...base,
        ...blank,
        type: 'unreadable',
        outcome: 'unreadable',
        reason: REASONS.unreadable!,
      })
      continue
    }
    for (const text of texts) {
      const parsed = parseContent(text)
      const url = /^https?:\/\//i.test(text.trim()) ? text.trim() : ''
      const row: Row = {
        file,
        ...base,
        ...blank,
        type: url ? 'url' : parsed.type,
        url,
        service: url ? (identifyQrService(url)?.name ?? '') : '',
        shortLink: url ? !!identifyQrService(url) || isShortLink(url) : false,
        duplicateOf: seen.get(text) ?? '',
        outcome: url ? '' : 'not-a-link',
        reason: url ? '' : REASONS['not-a-link']!,
      }
      if (!seen.has(text)) seen.set(text, file)
      rows.push(row)
    }
  }
  const toCheck = rows.filter((r) => r.url && !r.duplicateOf)
  let n = 0
  for (const row of toCheck) {
    process.stdout.write(`\rChecking ${++n}/${toCheck.length}`)
    await check(row)
  }
  process.stdout.write('\n')
  return rows
}

async function recheckFailures(): Promise<Row[]> {
  const rows = JSON.parse(await readFile(join(dir, 'results.json'), 'utf8')) as Row[]
  const failed = rows.filter((r) => r.url && !r.duplicateOf && r.outcome !== 'works')
  let n = 0
  for (const row of failed) {
    process.stdout.write(`\rRe-checking ${++n}/${failed.length}`)
    await check(row)
  }
  process.stdout.write('\n')
  return rows
}

/** A failure counts as dead only if it failed every check, and checks were at least a day apart. */
function isConfirmedDead(r: Row): boolean {
  if (!r.url || r.outcome === 'works' || r.outcome === 'uncertain') return false
  const times = [...r.history.matchAll(/@(\S+)/g)].map((m) => Date.parse(m[1]!))
  const first = times[0] ?? Date.parse(r.checkedAt)
  const allFailed = !/works@/.test(r.history)
  return allFailed && Date.parse(r.checkedAt) - first >= 24 * 3600 * 1000
}

function summary(rows: Row[]): string {
  const unique = rows.filter((r) => !r.duplicateOf)
  const links = unique.filter((r) => r.url)
  const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : 'n/a')
  const count = (list: Row[], key: (r: Row) => string) => {
    const m = new Map<string, number>()
    for (const r of list) m.set(key(r), (m.get(key(r)) ?? 0) + 1)
    return [...m].sort((a, b) => b[1] - a[1])
  }
  const dead = links.filter(isConfirmedDead)
  const table = (title: string, entries: [string, number][], total: number) =>
    [
      `### ${title}`,
      '',
      '| | Codes | Share |',
      '| --- | --- | --- |',
      ...entries.map(([k, v]) => `| ${k || '(blank)'} | ${v} | ${pct(v, total)} |`),
      '',
    ].join('\n')
  const short = links.filter((r) => r.shortLink)
  const direct = links.filter((r) => !r.shortLink)
  return [
    '# Dead QR codes: results',
    '',
    `Generated ${new Date().toISOString()}. Photos: ${new Set(rows.map((r) => r.file)).size}. Codes: ${unique.length} unique (${rows.length - unique.length} duplicates removed).`,
    '',
    `- Links: ${links.length}; confirmed dead (failed every check, at least 24 hours apart): **${dead.length} (${pct(dead.length, links.length)})**.`,
    `- Through a short link: ${short.length}, dead ${short.filter(isConfirmedDead).length} (${pct(short.filter(isConfirmedDead).length, short.length)}).`,
    `- Direct links: ${direct.length}, dead ${direct.filter(isConfirmedDead).length} (${pct(direct.filter(isConfirmedDead).length, direct.length)}).`,
    `- Not yet confirmed (failed once, re-check after 24 hours): ${links.filter((r) => r.outcome !== 'works' && r.outcome !== 'uncertain' && !isConfirmedDead(r)).length}. Verify by hand: ${links.filter((r) => r.outcome === 'uncertain').length}.`,
    '',
    table(
      'Every code, by latest result',
      count(unique, (r) => r.reason),
      unique.length,
    ),
    table(
      'Dead links, by reason',
      count(dead, (r) => r.reason),
      dead.length,
    ),
    table(
      'Dead links, by category',
      count(dead, (r) => r.category),
      dead.length,
    ),
    table(
      'Links, by category',
      count(links, (r) => r.category),
      links.length,
    ),
    table(
      'Dead links through a QR service, by service',
      count(
        dead.filter((r) => r.service),
        (r) => r.service,
      ),
      dead.length,
    ),
    '',
  ].join('\n')
}

// Without a working connection every link would look dead: check two well-known sites first.
const probes = await Promise.all(
  ['https://www.google.com', 'https://www.wikipedia.org'].map((u) => checkLink(u)),
)
if (!probes.some((p) => p.outcome === 'works')) {
  console.error('No internet connection (or it blocks these checks): nothing was checked.')
  process.exit(1)
}

const rows = recheck ? await recheckFailures() : await firstCheck()
const header = Object.keys(rows[0] ?? {}) as (keyof Row)[]
await writeFile(join(dir, 'results.json'), JSON.stringify(rows, null, 2))
await writeFile(
  join(dir, 'results.csv'),
  [header.join(','), ...rows.map((r) => header.map((h) => csvCell(r[h])).join(','))].join('\n'),
)
await writeFile(join(dir, 'summary.md'), summary(rows))
console.log(`Wrote results.csv, results.json and summary.md to ${dir}`)
