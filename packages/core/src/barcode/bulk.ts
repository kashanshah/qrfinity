/**
 * Bulk barcodes: rows pasted from a spreadsheet or read from a CSV file. Each row's first column is
 * the value; a second column, if any, is a file name or (for Amazon labels) the product title.
 */

export const MAX_BULK_ROWS = 1000

export type BulkRow = { line: number; value: string; extra: string }

/** Splits one CSV line, honouring quotes ("a, b" stays one field; "" is a quote). */
export function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        field += '"'
        i++
      } else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"' && field === '') quoted = true
    else if (ch === delimiter) {
      out.push(field)
      field = ''
    } else field += ch
  }
  out.push(field)
  return out.map((f) => f.trim())
}

/** Tabs (pasted from a spreadsheet) win over semicolons, then commas. */
function detectDelimiter(lines: string[]): string {
  const sample = lines.slice(0, 20).join('\n')
  if (sample.includes('\t')) return '\t'
  if (sample.includes(';') && !sample.includes(',')) return ';'
  return ','
}

/**
 * Reads pasted text or a CSV file into rows. Blank lines are skipped; a first row that looks like
 * a header ("value", "code", "number", "sku"…) is dropped. Returns at most MAX_BULK_ROWS rows.
 */
export function parseBulk(text: string): { rows: BulkRow[]; truncated: boolean } {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/)
  const delimiter = detectDelimiter(lines)
  const rows: BulkRow[] = []
  let truncated = false
  for (const [i, raw] of lines.entries()) {
    if (!raw.trim()) continue
    const [value = '', extra = ''] = splitCsvLine(raw, delimiter)
    if (
      !rows.length &&
      i === 0 &&
      /^(values?|codes?|numbers?|barcodes?|sku|upc|ean|gtin|fnsku|isbn|data|text)$/i.test(value)
    )
      continue
    if (!value) continue
    if (rows.length >= MAX_BULK_ROWS) {
      truncated = true
      break
    }
    rows.push({ line: i + 1, value, extra })
  }
  return { rows, truncated }
}

/** A safe, unique file name for each row: the second column if given, else the value. */
export function bulkFileNames(rows: { value: string; extra: string }[], ext: string): string[] {
  const used = new Map<string, number>()
  return rows.map((r) => {
    const base =
      (r.extra || r.value)
        .normalize('NFKD')
        .replace(/[^\w.-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'barcode'
    const n = (used.get(base) ?? 0) + 1
    used.set(base, n)
    return `${n > 1 ? `${base}-${n}` : base}.${ext}`
  })
}
