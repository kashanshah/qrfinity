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
