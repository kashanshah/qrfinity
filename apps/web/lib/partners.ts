/**
 * Optional partner links (Phase 6). Each one is hidden unless its URL is set, and carries UTM
 * tags so the partner can see where visits came from. Never ads: one quiet link each.
 */
const withUtm = (raw: string | undefined, campaign: string): string | null => {
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    url.searchParams.set('utm_source', 'qrfinity')
    url.searchParams.set('utm_medium', 'referral')
    url.searchParams.set('utm_campaign', campaign)
    return url.toString()
  } catch {
    return null
  }
}

/** "Print your QR code as stickers or magnets", shown after a download. */
export const PRINT_PARTNER_URL = withUtm(process.env.NEXT_PUBLIC_PRINT_PARTNER_URL, 'download')

/** "Need a QR campaign or landing page built?", in the footer. */
export const AGENCY_URL = withUtm(process.env.NEXT_PUBLIC_AGENCY_URL, 'footer')
