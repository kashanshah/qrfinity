import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'

const panel = (page: Page) => page.getByRole('complementary', { name: 'Your barcode' })

async function expectScans(page: Page) {
  await expect(
    panel(page)
      .getByText(/^(Scans|Won’t scan)$/)
      .first(),
  ).toHaveText('Scans', {
    timeout: 15_000,
  })
}

test('a UPC barcode is checked, scan-tested and downloads as PNG', async ({ page, isMobile }) => {
  await page.goto('/barcode-generator/upc')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Free UPC barcode generator')
  await expectScans(page)
  await expect(panel(page).getByText('036000291452', { exact: true }).first()).toBeVisible()

  // A wrong check digit is caught before anything is drawn.
  const field = page.getByLabel('UPC number')
  await field.fill('036000291453')
  await expect(page.getByText('The last digit should be 2')).toBeVisible()
  // Leaving it off adds it.
  await field.fill('03600029145')
  await expectScans(page)

  test.skip(isMobile, 'download covered on desktop')
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download PNG', exact: true }).click(),
  ])
  const bytes = await readFile((await download.path())!)
  expect(bytes.subarray(0, 4).toString('latin1')).toBe('\x89PNG')
  expect(download.suggestedFilename()).toBe('upc-036000291452.png')
})

test('vector formats point to paid plans on the free plan', async ({ page, isMobile }) => {
  test.skip(isMobile, 'covered on desktop')
  await page.goto('/barcode-generator/code-128')
  await expectScans(page)
  await page.getByRole('button', { name: 'SVG, with a paid plan' }).click()
  await expect(
    page.getByText('SVG, PDF, EPS and Zebra files come with any paid plan'),
  ).toBeVisible()
})

test('an Amazon FNSKU label scans and downloads for a thermal printer', async ({
  page,
  isMobile,
}) => {
  await page.goto('/barcode-generator/amazon-fnsku')
  await page.getByLabel('FNSKU', { exact: true }).fill('X002QRF1N7')
  await page.getByLabel('Product title').fill('Bamboo cutting board, large, with juice groove')
  await expectScans(page)
  await expect(panel(page).getByText('X002QRF1N7').first()).toBeVisible()

  test.skip(isMobile, 'download covered on desktop')
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download label (PNG)' }).click(),
  ])
  expect(download.suggestedFilename()).toBe('fnsku-X002QRF1N7-203dpi.png')
  const bytes = await readFile((await download.path())!)
  // 2.25 × 1.25 in at 203 dpi.
  expect(bytes.readUInt32BE(16)).toBe(457)
  expect(bytes.readUInt32BE(20)).toBe(254)
})

test('the menu opens the barcode section', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop menu')
  await page.goto('/')
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Barcodes' })
    .hover()
  await page.getByRole('link', { name: 'Amazon FNSKU labels' }).first().click()
  await expect(page).toHaveURL(/\/barcode-generator\/amazon-fnsku$/)
})

test('a Data Matrix code is drawn by the writer and scan-tested', async ({ page }) => {
  await page.goto('/barcode-generator/data-matrix')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Free Data Matrix code generator',
  )
  await expectScans(page)
  await page.getByLabel('Text or number').fill('Serial 7731-A, lot 42')
  await page.getByLabel('Rectangular shape').check()
  await expectScans(page)
})

test('GS1-128 fields are checked and an EAN-13 takes a price add-on', async ({ page }) => {
  await page.goto('/barcode-generator/gs1-128')
  await expectScans(page)
  await page.getByLabel('GS1 data').fill('(17)271341')
  await expect(page.getByText(/is a date written YYMMDD/)).toBeVisible()
  await page.getByLabel('GS1 data').fill('(01)0950110153000(10)ABC')
  await expectScans(page)
  await expect(panel(page).getByText('(01)09501101530003(10)ABC').first()).toBeVisible()

  await page.goto('/barcode-generator/isbn')
  await page.getByLabel('Add-on (optional)').fill('51299')
  await expectScans(page)
  await expect(panel(page).getByText('51299', { exact: true }).first()).toBeVisible()
})

test('bulk barcodes check every row and download a zip of PNGs', async ({ page, isMobile }) => {
  await page.goto('/barcode-generator/bulk')
  await page.getByLabel('Barcode type').selectOption('upca')
  await page.getByLabel('Values, one per line').fill('UPC\n036000291452\n03600029145\n036000291453')
  await expect(page.getByText('1 row needs fixing')).toBeVisible()
  await expect(page.getByText('Line 4')).toBeVisible()
  await expect(page.getByText('2 barcodes ready')).toBeVisible()
  await expect(page.getByText('First barcode scan-tested')).toBeVisible({ timeout: 15_000 })

  test.skip(isMobile, 'download covered on desktop')
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '2 PNGs at print size (.zip)' }).click(),
  ])
  expect(download.suggestedFilename()).toBe('upc-barcodes.zip')
  const bytes = await readFile((await download.path())!)
  expect(bytes.subarray(0, 2).toString('latin1')).toBe('PK')
  expect(bytes.includes(Buffer.from('036000291452.png'))).toBe(true)
  expect(bytes.includes(Buffer.from('036000291452-2.png'))).toBe(true)
})
