/**
 * Where analytics cookies need a yes first: the EU and EEA (GDPR), the UK (UK GDPR and PECR) and
 * Switzerland. Elsewhere analytics is on by default and can be turned off in Cookie settings.
 */
export const CONSENT_REQUIRED_COUNTRIES = new Set([
  // EU
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
  // EEA outside the EU, the UK and Switzerland
  'IS',
  'LI',
  'NO',
  'GB',
  'CH',
  // EU outermost regions sometimes reported separately
  'GF',
  'GP',
  'MQ',
  'RE',
  'YT',
  'MF',
])

/**
 * Reads the visitor's country from the hosting platform's header (Vercel or Cloudflare).
 * Unknown country: ask first, to be safe.
 */
export function consentRequiredFor(headers: Headers): boolean {
  const country = (headers.get('x-vercel-ip-country') ?? headers.get('cf-ipcountry') ?? '')
    .trim()
    .toUpperCase()
  if (!/^[A-Z]{2}$/.test(country) || country === 'XX' || country === 'T1') return true
  return CONSENT_REQUIRED_COUNTRIES.has(country)
}
