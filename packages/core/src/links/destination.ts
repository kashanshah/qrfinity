/**
 * Validation for dynamic-code destinations. Phase 4 adds URL-reputation checks,
 * shortener blocking and the configurable blocklist on top of these basic rules.
 */
import { normalizeWebUrl } from '../content'

export const MAX_DESTINATION_LENGTH = 2048

export type DestinationResult = { ok: true; url: string } | { ok: false; message: string }

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/
const PRIVATE_HOST =
  /(^localhost$)|(\.localhost$)|(\.local$)|(\.internal$)|(\.lan$)|(\.home\.arpa$)/i

export function validateDestination(
  input: string,
  shortDomains: readonly string[] = ['qrfinity.link'],
): DestinationResult {
  if (!input.trim()) return { ok: false, message: 'Enter the web address the code should open.' }
  const url = normalizeWebUrl(input)
  if (!url) return { ok: false, message: 'Enter a full web address, like example.com/menu.' }
  if (url.length > MAX_DESTINATION_LENGTH) {
    return { ok: false, message: 'That address is too long. Use one under 2,048 characters.' }
  }
  const parsed = new URL(url)
  if (parsed.username || parsed.password) {
    return { ok: false, message: 'Remove the user name or password from the address.' }
  }
  const host = parsed.hostname.toLowerCase()
  if (IPV4.test(host) || host.startsWith('[')) {
    return { ok: false, message: 'Use a domain name, not an IP address.' }
  }
  if (PRIVATE_HOST.test(host)) {
    return { ok: false, message: 'That address only works on a private network.' }
  }
  if (shortDomains.some((d) => host === d || host.endsWith('.' + d))) {
    return {
      ok: false,
      message: 'A code can’t point to another QRfinity short link. Use the final address.',
    }
  }
  return { ok: true, url }
}
