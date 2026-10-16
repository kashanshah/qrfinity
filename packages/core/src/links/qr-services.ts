/**
 * Short-link domains of other QR code services, so the checker can say which service a scanned
 * code runs through. Only domains whose owner we could confirm are listed; each carries its source.
 * The checker states facts ("this code runs through X's short link") and never claims a code
 * expired unless the link check shows it.
 */

export type QrService = { name: string; site: string }

const SERVICES: Record<string, QrService> = {
  // source: https://support.qr-code-generator.com/hc/en-us/articles/7664232533133-Why-did-a-QR-Code-or-link-brin (their help centre names qrco.de and l.ead.me as their short-link domains), seen 2026-10-16
  'qrco.de': { name: 'QR Code Generator PRO', site: 'qr-code-generator.com' },
  'l.ead.me': { name: 'QR Code Generator PRO', site: 'qr-code-generator.com' },
  // source: https://www.qrcode-tiger.com/short-url-generator (default short link qr1.be/…), seen 2026-10-16
  'qr1.be': { name: 'QR TIGER', site: 'qrcode-tiger.com' },
  // The services' own domains.
  'qrfy.io': { name: 'QRFY', site: 'qrfy.com' },
  'qrfy.com': { name: 'QRFY', site: 'qrfy.com' },
  'me-qr.com': { name: 'ME-QR', site: 'me-qr.com' },
  'qr.io': { name: 'QR.io', site: 'qr.io' },
  'qrcode-tiger.com': { name: 'QR TIGER', site: 'qrcode-tiger.com' },
  'qr-code-generator.com': { name: 'QR Code Generator PRO', site: 'qr-code-generator.com' },
}

/** The QR service behind a link, if its domain (or a parent domain) is a known one. */
export function identifyQrService(url: string): QrService | null {
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }
  for (let h = host; h.includes('.'); h = h.slice(h.indexOf('.') + 1)) {
    const hit = SERVICES[h]
    if (hit) return hit
  }
  return null
}

/** True for our own short links, which never expire. */
export function isQrfinityLink(url: string, shortDomains: readonly string[] = ['qrfinity.link']) {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return shortDomains.some((d) => host === d || host.endsWith('.' + d))
  } catch {
    return false
  }
}
