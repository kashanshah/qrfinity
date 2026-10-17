import { describe, expect, it } from 'vitest'
import { MAX_BULK_ROWS, bulkFileNames, parseBulk, splitCsvLine } from '../src/index'

describe('bulk barcodes', () => {
  it('splits CSV with quotes', () => {
    expect(splitCsvLine('X001,"Mug, blue ""large"""', ',')).toEqual(['X001', 'Mug, blue "large"'])
  })

  it('reads pasted spreadsheet rows, skipping a header and blank lines', () => {
    const { rows } = parseBulk('UPC\tName\n036000291452\tCola\n\n4006381333931\tPens\n')
    expect(rows).toEqual([
      { line: 2, value: '036000291452', extra: 'Cola' },
      { line: 4, value: '4006381333931', extra: 'Pens' },
    ])
  })

  it('reads one value per line, and semicolon CSV', () => {
    expect(parseBulk('A1\nA2').rows.map((r) => r.value)).toEqual(['A1', 'A2'])
    expect(parseBulk('A1;one\nA2;two').rows[1]).toEqual({ line: 2, value: 'A2', extra: 'two' })
  })

  it('stops at the row limit', () => {
    const r = parseBulk(Array.from({ length: MAX_BULK_ROWS + 5 }, (_, i) => `R${i}`).join('\n'))
    expect(r.rows).toHaveLength(MAX_BULK_ROWS)
    expect(r.truncated).toBe(true)
  })

  it('makes safe, unique file names', () => {
    expect(
      bulkFileNames(
        [
          { value: 'A/1', extra: '' },
          { value: 'X', extra: 'Mug: blue' },
          { value: 'X', extra: 'Mug: blue' },
        ],
        'png',
      ),
    ).toEqual(['A-1.png', 'Mug-blue.png', 'Mug-blue-2.png'])
  })
})
