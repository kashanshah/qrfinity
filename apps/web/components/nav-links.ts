/** The main menu: groups open on hover, keyboard focus or tap; each heading links to its hub. */
export type NavLink = { href: string; label: string }
export type NavItem = NavLink & { children?: NavLink[] }

export const NAV: NavItem[] = [
  {
    href: '/qr-code-generator',
    label: 'QR codes',
    children: [
      { href: '/qr-code-generator', label: 'All QR code types' },
      { href: '/dynamic-qr-code-generator', label: 'Dynamic QR codes' },
      { href: '/password-protected-qr-code', label: 'Password protection' },
      { href: '/qr-code-redirect', label: 'Redirect rules' },
      { href: '/custom-short-link-qr-code', label: 'Custom short links' },
      { href: '/qr-code-no-expiration', label: 'Codes that never expire' },
    ],
  },
  {
    href: '/barcode-generator',
    label: 'Barcodes',
    children: [
      { href: '/barcode-generator', label: 'Barcode generator' },
      { href: '/barcode-generator/upc', label: 'UPC' },
      { href: '/barcode-generator/ean-13', label: 'EAN-13' },
      { href: '/barcode-generator/amazon-fnsku', label: 'Amazon FNSKU labels' },
      { href: '/barcode-generator/isbn', label: 'ISBN for books' },
      { href: '/barcode-generator/code-128', label: 'Code 128' },
      { href: '/barcode-generator/itf-14', label: 'ITF-14 for cartons' },
      { href: '/barcode-generator/data-matrix', label: 'Data Matrix' },
      { href: '/barcode-generator/bulk', label: 'Bulk from a spreadsheet' },
    ],
  },
  {
    href: '/qr-code-scanner',
    label: 'Tools',
    children: [
      { href: '/qr-code-scanner', label: 'QR code scanner' },
      { href: '/qr-code-checker', label: 'QR code checker' },
      { href: '/qr-code-tester', label: 'QR code tester' },
    ],
  },
  { href: '/guides', label: 'Guides' },
  { href: '/pricing', label: 'Pricing' },
]
