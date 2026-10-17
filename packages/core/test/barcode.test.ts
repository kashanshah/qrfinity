import { describe, expect, it } from 'vitest'
import {
  AMAZON_LABEL_SIZES,
  DEFAULT_BAR_HEIGHT,
  checkAddon,
  checkBarcodeValue,
  parseGs1,
  code128Values,
  fitMiddle,
  fnskuLabelScene,
  fnskuLabelZpl,
  gtinCheckDigit,
  renderBarcode,
  sceneToEps,
  sceneToSvg,
  upceToUpca,
  type BarcodeType,
} from '../src/index'
import { decodeSvg } from './decode'

const style = (type: BarcodeType) => ({
  barHeight: DEFAULT_BAR_HEIGHT[type],
  showText: true,
  foreground: '#000000',
  background: '#ffffff',
  transparent: false,
})

/** Checks, renders and decodes a value, returning what a scanner reads. */
async function roundTrip(type: BarcodeType, input: string) {
  const checked = checkBarcodeValue(type, input)
  if (!checked.ok) throw new Error(checked.error)
  const { scene } = renderBarcode(type, checked.value, style(type), checked.above)
  // 4 px per module is plenty for the decoder.
  const formats = type === 'upca' ? ['UPCA'] : type === 'upce' ? ['UPCE'] : ['AllLinear']
  const px = Math.round(scene.width * 4)
  return decodeSvg(sceneToSvg(scene, { width: px }), px, formats)
}

describe('barcode check digits and validation', () => {
  it('computes GTIN check digits', () => {
    expect(gtinCheckDigit('400638133393')).toBe(1) // EAN-13 4006381333931
    expect(gtinCheckDigit('03600029145')).toBe(2) // UPC-A 036000291452
    expect(gtinCheckDigit('9638507')).toBe(4) // EAN-8 96385074
  })

  it('adds a missing check digit and rejects a wrong one', () => {
    expect(checkBarcodeValue('ean13', '400638133393')).toEqual({ ok: true, value: '4006381333931' })
    expect(checkBarcodeValue('ean13', '4006381333932')).toMatchObject({
      ok: false,
      error: expect.stringContaining('should be 1'),
    })
    expect(checkBarcodeValue('upca', '0360-0029-1452')).toEqual({ ok: true, value: '036000291452' })
    expect(checkBarcodeValue('ean8', '123')).toMatchObject({ ok: false })
  })

  it('converts ISBN-10 to ISBN-13 and checks both', () => {
    expect(checkBarcodeValue('isbn', '0-306-40615-2')).toMatchObject({
      ok: true,
      value: '9780306406157',
      above: 'ISBN 9780306406157',
    })
    expect(checkBarcodeValue('isbn', '978-0-306-40615-7')).toMatchObject({
      ok: true,
      value: '9780306406157',
      above: 'ISBN 978-0-306-40615-7',
    })
    expect(checkBarcodeValue('isbn', '0-306-40615-3')).toMatchObject({ ok: false })
  })

  it('expands UPC-E to check it', () => {
    expect(upceToUpca('0', '425261')).toBe('04210000526')
    expect(checkBarcodeValue('upce', '425261')).toEqual({ ok: true, value: '04252614' })
    expect(checkBarcodeValue('upce', '2425261')).toMatchObject({ ok: false })
  })

  it('limits Code 39 and Code 128 to what they can hold', () => {
    expect(checkBarcodeValue('code39', 'abc-123')).toEqual({ ok: true, value: 'ABC-123' })
    expect(checkBarcodeValue('code39', 'a_b')).toMatchObject({ ok: false })
    expect(checkBarcodeValue('code128', 'café')).toMatchObject({ ok: false })
  })

  it('checks FNSKUs', () => {
    expect(checkBarcodeValue('fnsku', 'x001abc2de')).toEqual({ ok: true, value: 'X001ABC2DE' })
    expect(checkBarcodeValue('fnsku', 'X001ABC')).toMatchObject({ ok: false })
    expect(checkBarcodeValue('fnsku', 'Z123456789')).toMatchObject({
      ok: true,
      note: expect.stringContaining('X0'),
    })
  })

  it('uses Code 128 set C for runs of digits', () => {
    expect(code128Values('123456')).toEqual([105, 12, 34, 56])
    expect(code128Values('AB')).toEqual([104, 33, 34])
    // Odd run at the end: one digit in B, then C.
    expect(code128Values('X12345')).toEqual([104, 56, 17, 99, 23, 45])
  })
})

describe('barcodes scan', () => {
  const cases: [BarcodeType, string, string][] = [
    ['ean13', '400638133393', '4006381333931'],
    // zxing reports UPC codes in their 13-digit EAN form: a leading 0, and UPC-E expanded.
    ['upca', '03600029145', '0036000291452'],
    ['ean8', '9638507', '96385074'],
    ['upce', '0425261', '0042100005264'],
    ['itf14', '1540014128876', '15400141288763'],
    ['code39', 'QRFINITY-42', 'QRFINITY-42'],
    ['code128', 'Order #1234567 / Box 9', 'Order #1234567 / Box 9'],
    ['isbn', '0-306-40615-2', '9780306406157'],
    ['fnsku', 'X001ABC2DE', 'X001ABC2DE'],
  ]
  for (const [type, input, expected] of cases) {
    it(`${type} decodes as ${expected}`, async () => {
      expect(await roundTrip(type, input)).toBe(expected)
    })
  }

  it('writes the same barcode as EPS', () => {
    const { scene } = renderBarcode('ean13', '4006381333931', style('ean13'))
    const eps = sceneToEps(scene, { widthPt: 105.7 })
    expect(eps).toContain('%!PS-Adobe-3.0 EPSF-3.0')
    expect(eps).toContain('(006381)')
  })
})

describe('GS1-128', () => {
  it('checks application identifiers', () => {
    expect(checkBarcodeValue('gs1128', '(01)0950110153000(10)ABC')).toEqual({
      ok: true,
      value: '(01)09501101530003(10)ABC',
    })
    expect(parseGs1('(01)09501101530004')).toMatchObject({
      ok: false,
      error: expect.stringContaining('should be 3'),
    })
    expect(parseGs1('(17)251399')).toMatchObject({
      ok: false,
      error: expect.stringContaining('YYMMDD'),
    })
    expect(parseGs1('(10)LOT 42')).toMatchObject({ ok: false })
    expect(parseGs1('(77)123')).toMatchObject({ ok: false, error: expect.stringContaining('(77)') })
    expect(parseGs1('01 09501101530003')).toMatchObject({ ok: false })
    expect(parseGs1('(3103)001250')).toMatchObject({ ok: true })
  })

  it('scans with FNC1 separators in the right places', async () => {
    const value = '(01)09501101530003(17)250101(10)ABC123(21)XYZ'
    const { scene } = renderBarcode('gs1128', value, style('gs1128'))
    const px = Math.round(scene.width * 4)
    expect(await decodeSvg(sceneToSvg(scene, { width: px }), px, ['Code128'])).toBe(value)
  })
})

describe('EAN-2 and EAN-5 add-ons', () => {
  it('accepts 2 or 5 digits', () => {
    expect(checkAddon('')).toEqual({ ok: true, value: '' })
    expect(checkAddon('51299')).toEqual({ ok: true, value: '51299' })
    expect(checkAddon('123')).toMatchObject({ ok: false })
  })

  for (const [type, value, addon, expected] of [
    ['isbn', '9780306406157', '51299', '978030640615751299'],
    ['ean13', '4006381333931', '12', '400638133393112'],
    ['upca', '036000291452', '05', '003600029145205'],
  ] as const) {
    it(`${type} with a ${addon.length}-digit add-on scans`, async () => {
      const checked = checkBarcodeValue(type, value)
      if (!checked.ok) throw new Error(checked.error)
      const { scene } = renderBarcode(type, checked.value, style(type), checked.above, addon)
      const px = Math.round(scene.width * 4)
      expect(
        await decodeSvg(sceneToSvg(scene, { width: px }), px, ['AllLinear'], {
          eanAddOnSymbol: 'Read',
        }),
      ).toBe(expected)
    })
  }
})

describe('Amazon FNSKU labels', () => {
  const size = AMAZON_LABEL_SIZES.find((s) => s.id === 'thermal-2.25x1.25')!

  it('cuts long titles in the middle', () => {
    const t = fitMiddle('A very long product title that will never fit on a small label', 2.4, 30)
    expect(t).toContain('…')
    expect(t.startsWith('A very')).toBe(true)
  })

  it('draws a label whose bars are whole printer dots and that scans', async () => {
    const { scene, moduleMm } = fnskuLabelScene({
      fnsku: 'X001ABC2DE',
      title: 'Bamboo cutting board, large, with juice groove',
      condition: 'New',
      size,
      dpi: 203,
    })
    expect(scene.width).toBeCloseTo(57.15)
    const dots = moduleMm / (25.4 / 203)
    expect(Math.abs(dots - Math.round(dots))).toBeLessThan(1e-9)
    const px = Math.round((scene.width / 25.4) * 203)
    expect(await decodeSvg(sceneToSvg(scene, { width: px }), px, ['Code128'])).toBe('X001ABC2DE')
  })

  it('writes ZPL for Zebra printers', () => {
    const zpl = fnskuLabelZpl(
      { fnsku: 'X001ABC2DE', title: 'Mug ^ special ~ chars', condition: 'New', size, dpi: 203 },
      12,
    )
    expect(zpl).toMatch(/^\^XA/)
    expect(zpl).toContain('^PW457')
    expect(zpl).toContain('^BCN,')
    expect(zpl).toContain('^FDX001ABC2DE^FS')
    expect(zpl).toContain('^PQ12')
    expect(zpl).not.toMatch(/Mug \^/)
    expect(zpl.trim().endsWith('^XZ')).toBe(true)
  })
})
