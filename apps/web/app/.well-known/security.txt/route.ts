/** RFC 9116 security contact. Renew "Expires" yearly (a test fails when it is close). */
export const SECURITY_TXT_EXPIRES = '2027-10-16T00:00:00.000Z'

export function GET() {
  const body = [
    'Contact: mailto:hello@qrfinity.com',
    'Contact: https://qrfinity.com/report',
    `Expires: ${SECURITY_TXT_EXPIRES}`,
    'Preferred-Languages: en',
    'Canonical: https://qrfinity.com/.well-known/security.txt',
    'Policy: https://qrfinity.com/acceptable-use',
    '',
  ].join('\n')
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
