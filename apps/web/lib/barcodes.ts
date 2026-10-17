import type { BarcodeType } from '@qrfinity/core'

/** What each barcode type is called, what it's for, and an example people can try. */
export const BARCODE_INFO: Record<
  BarcodeType,
  { name: string; use: string; example: string; label: string; hint: string; slug: string }
> = {
  code128: {
    name: 'Code 128',
    use: 'Shipping, inventory and asset tags',
    example: 'ABC-12345',
    label: 'Text or number',
    hint: 'Letters, digits, spaces and symbols, up to 80 characters.',
    slug: 'code-128',
  },
  upca: {
    name: 'UPC-A',
    use: 'Retail products in the US and Canada',
    example: '036000291452',
    label: 'UPC number',
    hint: '12 digits, or 11 and we add the check digit.',
    slug: 'upc',
  },
  ean13: {
    name: 'EAN-13',
    use: 'Retail products worldwide',
    example: '4006381333931',
    label: 'EAN number',
    hint: '13 digits, or 12 and we add the check digit.',
    slug: 'ean-13',
  },
  ean8: {
    name: 'EAN-8',
    use: 'Small retail packages',
    example: '96385074',
    label: 'EAN-8 number',
    hint: '8 digits, or 7 and we add the check digit.',
    slug: 'ean-8',
  },
  upce: {
    name: 'UPC-E',
    use: 'Small packages in the US and Canada',
    example: '04252614',
    label: 'UPC-E number',
    hint: '6 digits, 7 with the number system (0 or 1), or 8 with the check digit.',
    slug: 'upc-e',
  },
  itf14: {
    name: 'ITF-14',
    use: 'Shipping cartons and cases',
    example: '15400141288763',
    label: 'GTIN-14',
    hint: '14 digits, or 13 and we add the check digit.',
    slug: 'itf-14',
  },
  code39: {
    name: 'Code 39',
    use: 'ID badges, older industrial systems',
    example: 'QRFINITY-42',
    label: 'Text',
    hint: 'A–Z, 0–9, space and - . $ / + %. Letters become capitals.',
    slug: 'code-39',
  },
  isbn: {
    name: 'ISBN',
    use: 'Books',
    example: '978-0-306-40615-7',
    label: 'ISBN',
    hint: '13 digits starting 978 or 979, or an old 10-character ISBN (we convert it).',
    slug: 'isbn',
  },
  fnsku: {
    name: 'Amazon FNSKU',
    use: 'Amazon FBA labels',
    example: 'X001ABC2DE',
    label: 'FNSKU',
    hint: '10 letters and digits, from Seller Central → Inventory → Manage FBA inventory.',
    slug: 'amazon-fnsku',
  },
}

/** The order types appear in pickers and menus. */
export const BARCODE_ORDER: BarcodeType[] = [
  'code128',
  'upca',
  'ean13',
  'fnsku',
  'isbn',
  'itf14',
  'ean8',
  'upce',
  'code39',
]

export const barcodePath = (type: BarcodeType) => `/barcode-generator/${BARCODE_INFO[type].slug}`
